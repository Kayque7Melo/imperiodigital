const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let csrf = null;
let current = null;
let dashboardData = null;
let members = [];
let linkItems = [];
let selectedLinkUser = 'all';
let selectedLinkStatus = 'all';
let selectedLinkCategory = 'all';
let selectedLinkBm = 'all';
let showLinkArchive = false;
let rankingPeriod = 'daily';
let accessRows = [];
let accessUserFilter = 'all';
let activityUserFilter = 'all';
let linksBalanceCents = 0;
let linksPendingCount = 0;
let valuePerLinkCents = 5000;
let notifications = [];
let unreadNotifications = 0;
let activityData = { days: [] };
let rankingData = [];
let payoutData = { payouts: [], balances: [] };
let notificationsTimer = null;
let notificationIds = new Set();
let activeView = 'overview';
let toastTimer;
const META_CREATE_PORTFOLIO_URL = 'https://business.facebook.com/business/loginpage/?login_options%5B0%5D=FB&login_options%5B1%5D=IG&login_options%5B2%5D=SSO&config_ref=biz_login_tool_flavor_mbs&create_business_portfolio_for_bm=1';

const ri = {
  grid: 'ri-dashboard-3-line', users: 'ri-group-line', link: 'ri-link', check: 'ri-check-line',
  download: 'ri-download-cloud-2-line', camera: 'ri-camera-line', settings: 'ri-settings-3-line',
  x: 'ri-close-line', spark: 'ri-sparkling-2-line', shield: 'ri-shield-check-line',
  chart: 'ri-bar-chart-2-line', bell: 'ri-notification-3-line', arrow: 'ri-arrow-right-line',
  plus: 'ri-add-line', clock: 'ri-time-line', logout: 'ri-logout-box-r-line',
  close: 'ri-close-line', eye: 'ri-eye-line', copy: 'ri-file-copy-line', book: 'ri-book-open-line', play: 'ri-play-circle-line',
  lock: 'ri-lock-2-line', wave: 'ri-pulse-line', menu: 'ri-menu-line',
};
const svg = (name, size = 17) => `<i class="ic ${ri[name] || ri.spark}" style="font-size:${size}px" aria-hidden="true"></i>`;
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateFmt = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
let notificationAudioContext = null;
async function playNotificationSound(force = false) {
  if (!force && localStorage.getItem('eq_sound_notifications') === 'false') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    notificationAudioContext ||= new AudioContextClass();
    const context = notificationAudioContext;
    if (context.state === 'suspended') await context.resume();
    const start = context.currentTime;
    // A short, bright three-note chime at a comfortable notification level.
    [{ hz: 880, at: 0, length: .19 }, { hz: 1175, at: .14, length: .23 }, { hz: 1047, at: .34, length: .28 }].forEach(note => {
      for (const [ratio, level, type] of [[1, .24, 'sine'], [2, .055, 'triangle']]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const when = start + note.at;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(note.hz * ratio, when);
        gain.gain.setValueAtTime(.0001, when);
        gain.gain.linearRampToValueAtTime(level, when + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, when + note.length);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(when);
        oscillator.stop(when + note.length + .015);
      }
    });
  } catch {}
}
function notificationMarkup() { return `<div class="notification-head"><strong>Notificações</strong>${unreadNotifications?'<button class="action-link" id="mark-notifications-read">Marcar como lidas</button>':''}</div>${notifications.length?notifications.slice(0,12).map(item=>`<div class="notification-row ${item.readAt?'':'unread'}"><span class="notification-dot"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small><time>${dateFmt(item.createdAt)}</time></span></div>`).join(''):'<div class="notification-empty">Tudo em dia. As novidades da equipe aparecerão aqui.</div>'}`; }
async function refreshNotifications(playSound=true) {
  if(!current)return; try { const result=await api('/api/notifications',{headers:{'X-CSRF-Token':csrf}}); const incoming=(result.notifications||[]).filter(item=>!notificationIds.has(item.id)); if(notificationIds.size&&incoming.length&&playSound){playNotificationSound();notify(incoming[0].title)} notifications=result.notifications||[];unreadNotifications=result.unread||0;notificationIds=new Set(notifications.map(item=>item.id));const badge=document.querySelector('#notification-count');if(badge){badge.textContent=unreadNotifications>9?'9+':String(unreadNotifications);badge.hidden=!unreadNotifications}const panel=document.querySelector('#notification-panel');if(panel){panel.innerHTML=notificationMarkup();panel.querySelector('#mark-notifications-read')?.addEventListener('click',async()=>{try{await api('/api/notifications/read',{method:'POST',body:'{}'});await refreshNotifications(false)}catch(error){notify(error.message)}})} }catch{}
}
function bindNotificationActions() {
 document.querySelector('#notification-toggle')?.addEventListener('click',async()=>{const panel=document.querySelector('#notification-panel');panel?.classList.toggle('open');if(panel?.classList.contains('open'))await refreshNotifications(false)});
 document.querySelector('#mark-notifications-read')?.addEventListener('click',async()=>{try{await api('/api/notifications/read',{method:'POST',body:'{}'});await refreshNotifications(false)}catch(error){notify(error.message)}});
}
async function api(url, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method !== 'GET' || csrf && options.headers?.['X-CSRF-Token'] ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const fallback = response.status === 404
      ? 'A API do sistema não foi encontrada nesta implantação. Aguarde a publicação mais recente da Vercel.'
      : `O servidor não concluiu a solicitação (erro ${response.status}). Tente novamente em instantes.`;
    throw Object.assign(new Error(data.error || fallback), { status: response.status });
  }
  return data;
}
async function copyTextToClipboard(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {}
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, field.value.length);
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Não foi possível copiar automaticamente. Selecione e copie o link manualmente.');
}

function brand(mobile = false) {
  return `<div class="brand ${mobile ? 'login-brand-mobile' : ''}"><div class="brand-mark"><img src="/imperio-mark.png" alt="" aria-hidden="true"></div><div><div class="brand-title">Império Digital</div><span class="brand-sub">espaço de trabalho</span></div></div>`;
}
function renderLogin() {
  const saved = localStorage.getItem('eq_saved_login') || '';
  app.innerHTML = `<main class="login-screen">
    <section class="login-art">${brand()}<div class="art-center"><div class="brand-logo"><img src="/imperio-logo.png" alt="Império Digital Ads"></div><div class="orb-wrap"><div class="orb-halo one"></div><div class="orb-halo two"></div><div class="orb-line"></div><div class="orb-line second"></div><div class="orb"></div></div><div class="art-copy"><span class="art-kicker">Império Digital</span><h1>Seu trabalho merece um espaço <span>à altura.</span></h1><p>Um ambiente privado para conectar pessoas, organizar a operação e transformar boas ideias em movimento.</p></div></div><div class="art-foot"><span>© ${new Date().getFullYear()} Império Digital</span><span class="connection"><i></i> Ambiente seguro</span></div></section>
    <section class="login-side"><div class="login-card">${brand(true)}<div class="login-eyebrow">Acesso à equipe</div><h2>Bom ter você por aqui.</h2><p class="login-lead">Entre com os dados da sua conta para acessar seu espaço de trabalho.</p><form id="login-form"><div class="field"><label for="username">Nome de usuário ou e-mail</label><input id="username" name="username" autocomplete="username" placeholder="Seu usuário ou e-mail" value="${escapeHtml(saved)}" required autofocus></div><div class="field"><label for="password">Senha</label><div class="input-wrap"><input class="has-toggle" id="password" name="password" type="password" autocomplete="current-password" placeholder="Sua senha" required><button class="password-toggle" id="show-password" type="button">Mostrar</button></div></div><div class="form-row"><label class="check-label"><input id="remember-login" type="checkbox" ${saved ? 'checked' : ''}> Lembrar meu login neste aparelho</label><span>Área restrita</span></div><div class="login-error" id="login-error"></div><button class="primary-btn login-submit" id="login-submit" type="submit">Entrar no espaço ${svg('arrow', 15)}</button></form><div class="secure-note">${svg('lock', 14)} Acesso protegido e exclusivo para convidados</div><div class="login-note">As contas são disponibilizadas pela administração da equipe.<br>Precisa de acesso? Fale com o administrador.</div></div></section></main>`;
  document.querySelector('#show-password').addEventListener('click', event => {
    const input = document.querySelector('#password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar';
  });
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#login-submit');
    const error = document.querySelector('#login-error');
    button.disabled = true;
    button.innerHTML = 'Validando acesso…';
    error.classList.remove('show');
    try {
      const form = new FormData(event.currentTarget);
      const username = String(form.get('username')).trim();
      const remember = document.querySelector('#remember-login').checked;
      const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password: form.get('password'), remember }) });
      csrf = result.csrf; current = result.user; activeView = 'overview';
      if (remember) localStorage.setItem('eq_saved_login', username); else localStorage.removeItem('eq_saved_login');
      await openDashboard();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
      button.disabled = false;
      button.innerHTML = `Entrar no espaço ${svg('arrow', 15)}`;
      document.querySelector('#password').value = '';
      document.querySelector('#password').focus();
    }
  });
}
function navItem(key, label, iconName, badge = '') {
  return `<button class="nav-item ${activeView === key ? 'active' : ''}" data-nav="${key}">${svg(iconName, 17)}<span>${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}</button>`;
}
function metricCard(item) {
  return `<article class="metric"><div class="metric-top"><span>${escapeHtml(item.label)}</span><span class="metric-icon">${svg(item.icon, 15)}</span></div><div class="metric-value">${escapeHtml(item.value)}<span class="metric-sub">${escapeHtml(item.detail)}</span></div></article>`;
}
function memberRows(list) {
  if (!list.length) return '<div class="empty-state">Nenhuma conta encontrada.</div>';
  return list.map(member => `<tr data-user-row="${escapeHtml(member.id)}"><td><div class="user-name">${avatarMarkup(member)}<span><strong>${escapeHtml(member.name)}</strong><small>@${escapeHtml(member.username)}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</small></span></div></td><td><span class="role-pill ${member.role === 'admin' ? 'admin' : ''}">${member.role === 'admin' ? 'Administrador' : 'Equipe'}</span></td><td><span class="status-pill ${member.active ? '' : 'inactive'}"><i class="live-dot" style="${member.active ? '' : 'background:#ff8e96;box-shadow:none'}"></i>${member.active ? 'Ativa' : 'Inativa'}</span></td><td>${dateFmt(member.createdAt)}</td><td>${member.role === 'admin' ? '<span style="color:#687873;font-size:10px">Conta do ambiente</span>' : `<div class="table-actions"><button class="action-link" data-action="login-as" data-id="${escapeHtml(member.id)}">Entrar</button><button class="action-link" data-action="password" data-id="${escapeHtml(member.id)}">Redefinir senha</button><button class="action-link ${member.active ? 'danger' : ''}" data-action="toggle" data-id="${escapeHtml(member.id)}">${member.active ? 'Desativar' : 'Ativar'}</button><button class="action-link danger" data-action="delete" data-id="${escapeHtml(member.id)}">Excluir conta</button></div>`}</td></tr>`).join('');
}
function avatarMarkup(profile, className = 'avatar') {
  const fallback = `<span class="avatar-fallback">${initials(profile?.name)}</span>`;
  return `<span class="${className} ${profile?.avatar ? 'has-photo' : ''}" aria-label="Foto de ${escapeHtml(profile?.name || 'perfil')}">${profile?.avatar ? `<img src="${escapeHtml(profile.avatar)}" alt="" data-avatar-image>${fallback}` : fallback}</span>`;
}
function money(cents) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function linkStatus(link) {
  const labels = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Desaprovado' };
  if (link.status === 'rejected' && link.reanalysisRequestedAt) return `<span class="status-pill link-status pending"><i></i>Reanálise solicitada</span>`;
  return `<span class="status-pill link-status ${link.status}"><i></i>${labels[link.status] || 'Pendente'}</span>`;
}
function renderLinkCards(list, isAdmin) {
  if (!list.length) return `<div class="links-empty"><span class="empty-link-icon">${svg('link', 21)}</span><strong>${isAdmin ? 'Nenhum link neste filtro' : 'Seu fluxo começa com um link'}</strong><p>${isAdmin ? 'Escolha outra pessoa ou aguarde novos envios da equipe.' : 'Envie quantos links precisar. Cada um será analisado pela administração.'}</p></div>`;
  return list.map(link => `<article class="submitted-link" data-link-card="${escapeHtml(link.id)}"><div class="link-card-top"><div class="link-id-wrap"><span class="link-icon">${svg('link', 15)}</span><span><strong>${escapeHtml(link.publicId)}</strong><small>${escapeHtml(link.userName)} · @${escapeHtml(link.username)}</small></span></div>${linkStatus(link)}</div><div class="link-label">${escapeHtml(link.label || 'Link enviado')} · ${escapeHtml(link.category || 'Outros')} · BM ${link.bmLimit === '2000' ? '2k' : link.bmLimit === '250' ? '250' : 'não informado'}${link.paidAt ? ' · Pago' : ''}${link.archivedAt ? ' · Arquivado' : ''}</div><a class="link-url" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" title="Abrir link">${escapeHtml(link.url)}</a><div class="link-card-bottom"><span class="link-meta">Enviado em ${dateFmt(link.createdAt)}${isAdmin && link.status === 'approved' ? ` · <b class="approved-credit">${money(link.valueCents)}</b>` : ''}${link.status === 'rejected' && link.reason ? ` · <span class="reject-reason">${escapeHtml(link.reason)}</span>` : ''}</span><div class="link-actions"><button type="button" class="soft-btn small-soft${link.copiedAt ? ' copied' : ''}" data-link-copy="${escapeHtml(link.id)}">${svg(link.copiedAt ? 'check' : 'copy', 13)} ${link.copiedAt ? 'Copiado' : 'Copiar link'}</button>${isAdmin && link.status === 'approved' && !link.paidAt && !link.archivedAt ? `<button class="soft-btn small-soft" data-link-archive="${escapeHtml(link.id)}">Arquivar</button>` : ''}${isAdmin && link.status === 'pending' ? `<button class="approve-btn" data-link-decision="approved" data-id="${escapeHtml(link.id)}">${svg('check', 13)} Aprovar</button><button class="reject-btn" data-link-decision="rejected" data-id="${escapeHtml(link.id)}">${svg('x', 13)} Desaprovar</button>` : ''}${isAdmin && link.status === 'rejected' && link.reanalysisRequestedAt ? `<button class="approve-btn" data-link-decision="approved" data-id="${escapeHtml(link.id)}">${svg('check', 13)} Aprovar reanálise</button><button class="reject-btn" data-link-decision="rejected" data-id="${escapeHtml(link.id)}">${svg('x', 13)} Manter desaprovado</button>` : ''}${!isAdmin && link.status === 'rejected' ? (link.reanalysisRequestedAt ? '<span class="link-meta">Pedido enviado · aguardando administrador</span>' : `<button class="soft-btn small-soft" data-link-reanalysis="${escapeHtml(link.id)}">Pedir reanálise</button>`) : ''}</div></div></article>`).join('');
}
function downloadLinksText(list, target, adminView = false) {
  const safeName = (target?.username || target?.name || 'equipe').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'equipe';
  const lines = [
    'IMPÉRIO DIGITAL | RELATÓRIO DE LINKS',
    `Usuário: ${target?.name || 'Equipe'} (@${target?.username || 'equipe'})`,
    `Exportado em: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date())}`,
    `Total de links: ${list.length}`,
    '',
    ...list.map(link => [
      '----------------------------------------',
      `ID: ${link.publicId}`,
      `Pessoa: ${link.userName} (@${link.username})`,
      `Título: ${link.label || 'Sem título'}`,
      `Link: ${link.url}`,
      `Status: ${{ pending: 'Pendente', approved: 'Aprovado', rejected: 'Desaprovado' }[link.status] || link.status}`,
      adminView ? `Valor administrativo: ${link.status === 'approved' ? money(link.valueCents) : money(0)}` : '',
      `Enviado em: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(link.createdAt))}`,
      `Analisado em: ${link.decidedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(link.decidedAt)) : 'Ainda não analisado'}`,
      link.reason ? `Observação: ${link.reason}` : '',
      ''
    ].filter(Boolean).join('\n'))
  ];
  const file = new Blob(['\uFEFF' + lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(file);
  anchor.download = `${safeName}_links.txt`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}
function linkSection(isAdmin) {
  const target = isAdmin && selectedLinkUser !== 'all' ? members.find(member => member.id === selectedLinkUser) : current;
  const reviewedBalance = linksBalanceCents;
  const filter = `${isAdmin ? `<select class="search-input user-filter" id="link-user-filter" aria-label="Filtrar links por usuário"><option value="all" ${selectedLinkUser === 'all' ? 'selected' : ''}>Toda a equipe</option>${members.map(member => `<option value="${escapeHtml(member.id)}" ${selectedLinkUser === member.id ? 'selected' : ''}>${escapeHtml(member.name)}${member.active ? '' : ' · inativa'}</option>`).join('')}</select>` : ''}<select class="search-input status-filter" id="link-status-filter"><option value="all">Todos os status</option><option value="pending" ${selectedLinkStatus === 'pending' ? 'selected' : ''}>Pendentes</option><option value="reanalysis" ${selectedLinkStatus === 'reanalysis' ? 'selected' : ''}>Reanálise solicitada</option><option value="approved" ${selectedLinkStatus === 'approved' ? 'selected' : ''}>Aprovados</option><option value="rejected" ${selectedLinkStatus === 'rejected' ? 'selected' : ''}>Desaprovados</option></select><select class="search-input" id="link-category-filter" aria-label="Filtrar por categoria"><option value="all">Todas as categorias</option>${['Anúncio','Captação','Afiliado','Loja','Outros'].map(category => `<option value="${category}" ${selectedLinkCategory === category ? 'selected' : ''}>${category}</option>`).join('')}</select><select class="search-input" id="link-bm-filter" aria-label="Filtrar limite da BM"><option value="all">Todas as BMs</option><option value="250" ${selectedLinkBm === '250' ? 'selected' : ''}>BM 250</option><option value="2000" ${selectedLinkBm === '2000' ? 'selected' : ''}>BM 2k</option></select><button type="button" class="soft-btn" id="link-archive-toggle">${showLinkArchive ? 'Ver links ativos' : 'Histórico de links pagos'}</button>`;
  const targetBalanceLabel = isAdmin && selectedLinkUser === 'all' ? 'Total aprovado na equipe' : 'Saldo ilustrativo';
  const shown = linkItems.filter(link => selectedLinkStatus === 'all' || (selectedLinkStatus === 'reanalysis' ? link.status === 'rejected' && link.reanalysisRequestedAt : link.status === selectedLinkStatus)).filter(link => selectedLinkCategory === 'all' || link.category === selectedLinkCategory).filter(link => selectedLinkBm === 'all' || link.bmLimit === selectedLinkBm);
  return `<section class="links-section" id="links-section"><div class="section-title"><div><h2>${isAdmin ? 'Central de links' : 'Meus links'}</h2><p>${isAdmin ? 'Analise envios, categoria, limite de BM e histórico.' : 'Envie links e acompanhe o status de cada análise.'}</p></div><div class="link-head-actions">${filter}<button class="soft-btn" id="export-links">${svg('download', 14)} Exportar TXT</button></div></div>${isAdmin ? `<div class="link-summary"><div class="link-summary-card"><span class="link-summary-icon">${svg('spark', 15)}</span><span><small>${targetBalanceLabel}</small><strong id="links-balance">${money(reviewedBalance)}</strong><em id="link-value-label">Visível somente para a administração · valor registrado por link aprovado</em></span></div><div class="link-summary-card pending-summary"><span class="link-summary-icon">${svg('clock', 15)}</span><span><small>Aguardando sua análise</small><strong id="links-pending">${linksPendingCount}</strong><em>Links pendentes da seleção atual</em></span></div></div><article class="panel payout-panel"><div class="panel-head"><div><h3>Gestão de valores por usuário</h3><span>Valores de links aprovados, disponíveis só para a administração.</span></div></div><div class="payout-balances">${payoutData.balances.filter(item=>item.balanceCents>0).map(item=>`<div class="payout-row">${avatarMarkup(item)}<span><strong>${escapeHtml(item.name)}</strong><small>${money(item.balanceCents)} · ${item.approvedCount} links · ${money(item.linkValueCents)} por link</small></span><button class="soft-btn" data-payout-user="${escapeHtml(item.userId)}">Registrar pagamento</button></div>`).join('')||'<div class="notification-empty">Nenhum valor aprovado pendente.</div>'}</div></article><article class="panel payout-history"><div class="panel-head"><h3>Histórico de pagamentos</h3></div>${payoutData.payouts.slice(0,8).map(item=>`<div class="payout-row"><span class="module-icon">${svg('check',14)}</span><span><strong>${escapeHtml(item.userName)}</strong><small>${item.linkIds.length} links · IDs ${item.linkIds.map(escapeHtml).join(', ')}</small></span><b>${money(item.amountCents)}</b><time>${dateFmt(item.createdAt)}</time></div>`).join('')||'<div class="notification-empty">Os pagamentos registrados aparecerão aqui.</div>'}</article>` : `<div class="link-summary"><div class="link-summary-card pending-summary"><span class="link-summary-icon">${svg('clock', 15)}</span><span><small>Aguardando aprovação</small><strong id="links-pending">${linksPendingCount}</strong><em>Seu saldo é privado e só a administração pode consultá-lo.</em></span></div></div>`}${!isAdmin ? `<form id="submit-link-form" class="submit-link-form"><div class="submit-link-title"><div class="submit-link-title-copy"><span class="link-icon">${svg('plus', 15)}</span><span><strong>Adicionar um link</strong><small>Informe o tipo de BM e a categoria para organizar os envios.</small></span></div><a class="primary-btn compact portfolio-cta" href="${META_CREATE_PORTFOLIO_URL}" target="_blank" rel="noopener noreferrer">${svg('plus', 14)} Criar Portfólio</a></div><div class="link-form-fields"><label class="modal-field"><span>Link</span><input name="url" type="url" placeholder="https://exemplo.com/sua-pagina" required maxlength="2048"></label><label class="modal-field"><span>Nome para identificar (opcional)</span><input name="label" type="text" placeholder="Ex.: Campanha de outubro" maxlength="120"></label><label class="modal-field"><span>Categoria</span><select name="category" class="search-input" required><option value="Anúncio">Anúncio</option><option value="Captação">Captação</option><option value="Afiliado">Afiliado</option><option value="Loja">Loja</option><option value="Outros">Outros</option></select></label><label class="modal-field"><span>Limite da BM</span><select name="bmLimit" class="search-input" required><option value="250">BM de 250</option><option value="2000">BM de 2k</option></select></label><button class="primary-btn compact" type="submit" id="submit-link-button">${svg('plus', 14)} Enviar para análise</button></div><div class="login-error" id="link-form-error"></div></form>` : ''}<div class="links-list-head"><strong>${showLinkArchive ? 'Links pagos arquivados' : (isAdmin ? 'Links enviados' : 'Histórico de envios')}</strong><span id="links-total">${shown.length} ${shown.length === 1 ? 'link' : 'links'}</span></div><div id="links-list" class="links-list">${renderLinkCards(shown, isAdmin)}</div></section>`;
}
function chartMarkup() {
  const days=activityData?.days||[];const max=Math.max(1,...days.map(day=>day.count));const pts=days.map((day,i)=>({x:days.length<2?300:i*600/(days.length-1),y:132-(day.count/max)*105}));const line=pts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');const area=pts.length?`${line} L600 160 L0 160Z`:'';
  return `<div class="flow-chart"><div class="chart-grid"></div><svg class="chart-svg" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b9dcff" stop-opacity=".22"/><stop offset="1" stop-color="#b9dcff" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#area)"/><path d="${line}" fill="none" stroke="#9dcfff" stroke-width="2.4" vector-effect="non-scaling-stroke"/>${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#d2e9ff" stroke="#233b55" stroke-width="3"/>`).join('')}</svg><div class="chart-labels">${days.map(day=>`<span>${escapeHtml(day.label)}</span>`).join('')}</div></div>`;
}
async function fetchInsights() {
  const admin=current?.role==='admin'&&!dashboardData?.impersonating;
  const userId=admin?activityUserFilter:'all';
  const accessQuery=accessUserFilter==='all'?'':`?userId=${encodeURIComponent(accessUserFilter)}`;
  const results=await Promise.all([api(`/api/activity?userId=${encodeURIComponent(userId)}`,{headers:{'X-CSRF-Token':csrf}}),api(`/api/ranking?period=${rankingPeriod}`,{headers:{'X-CSRF-Token':csrf}}),...(admin?[api('/api/payouts',{headers:{'X-CSRF-Token':csrf}}),api(`/api/access-history${accessQuery}`,{headers:{'X-CSRF-Token':csrf}})]:[])]);
  activityData=results[0];rankingData=results[1].ranking||[];if(admin){payoutData=results[2];accessRows=results[3].accesses||[];}
}
function rankingView() {
  const podium=rankingData.slice(0,3);const podiumOrder=[podium[1],podium[0],podium[2]].filter(Boolean);
  const bars=rankingData.slice(0,8);const max=Math.max(1,...bars.map(item=>item.submitted));
  return `<section class="ranking-page"><div class="section-title"><div><div class="eyebrow">DESEMPENHO DA EQUIPE</div><h2>Ranking de envios</h2><p>Compare o ritmo por período.</p></div><select id="ranking-period" class="search-input"><option value="daily" ${rankingPeriod==='daily'?'selected':''}>Diário</option><option value="monthly" ${rankingPeriod==='monthly'?'selected':''}>Mensal</option><option value="annual" ${rankingPeriod==='annual'?'selected':''}>Anual</option></select></div><div class="podium">${podiumOrder.map((member,index)=>`<article class="podium-card place-${index===1?'1':index===0?'2':'3'}"><span class="podium-place">${index===1?'1º':index===0?'2º':'3º'}</span>${avatarMarkup(member,'avatar podium-avatar')}<strong>${escapeHtml(member.name)}</strong><small>@${escapeHtml(member.username)}</small><b>${member.submitted} links</b><span>${member.approved} aprovados</span></article>`).join('')||'<div class="empty-state">O pódio aparece quando a equipe enviar links neste período.</div>'}</div><article class="panel ranking-chart-panel"><div class="panel-head"><h3>Links enviados por pessoa</h3><span>${rankingPeriod==='daily'?'Hoje':rankingPeriod==='monthly'?'Este mês':'Este ano'}</span></div>${bars.length?bars.map(member=>`<div class="rank-bar-row">${avatarMarkup(member,'avatar rank-avatar')}<span>${escapeHtml(member.name)}</span><div class="rank-track"><i style="width:${Math.max(4,member.submitted/max*100)}%"></i></div><b>${member.submitted}</b></div>`).join(''):'<div class="empty-state">Ainda não há envios neste período.</div>'}</article></section>`;
}
function accessView() {
  return `<section><div class="section-title"><div><div class="eyebrow">SEGURANÇA E CONTROLE</div><h2>Histórico de acessos</h2><p>Endereço IP, dispositivo e horário dos últimos logins registrados.</p></div><div class="link-head-actions"><select id="access-user-filter" class="search-input"><option value="all">Todos os usuários</option>${members.filter(member=>member.role!=='admin').map(member=>`<option value="${escapeHtml(member.id)}" ${accessUserFilter===member.id?'selected':''}>${escapeHtml(member.name)}</option>`).join('')}</select><button class="soft-btn" id="download-backup">Baixar backup</button></div></div><article class="panel table-wrap"><table class="user-table"><thead><tr><th>Usuário</th><th>IP</th><th>Dispositivo</th><th>Data e hora</th></tr></thead><tbody>${accessRows.map(row=>`<tr><td>${escapeHtml(row.userName)} · @${escapeHtml(row.username)}</td><td>${escapeHtml(row.ip||'Não identificado')}</td><td>${escapeHtml(row.userAgent||'Não identificado')}</td><td>${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(row.createdAt))}</td></tr>`).join('')||'<tr><td colspan="4" class="empty-state">Ainda não há acessos registrados.</td></tr>'}</tbody></table></article></section>`;
}
async function fetchLinks() {
  const isAdmin = current?.role === 'admin' && !dashboardData?.impersonating;
  const params = new URLSearchParams();
  if (isAdmin) params.set('userId', selectedLinkUser);
  if (showLinkArchive) params.set('archive', 'true');
  const query = params.size ? `?${params}` : '';
  const result = await api(`/api/links${query}`, { headers: { 'X-CSRF-Token': csrf } });
  linkItems = result.links;
  linksBalanceCents = result.balanceCents || 0;
  linksPendingCount = result.pendingCount;
  valuePerLinkCents = result.valuePerLinkCents ?? null;
}
function updateLinksUi() {
  const list = document.querySelector('#links-list');
  if (!list) return;
  const isAdmin = current?.role === 'admin' && !dashboardData?.impersonating;
  const shown = linkItems.filter(link => selectedLinkStatus === 'all' || (selectedLinkStatus === 'reanalysis' ? link.status === 'rejected' && link.reanalysisRequestedAt : link.status === selectedLinkStatus)).filter(link => selectedLinkCategory === 'all' || link.category === selectedLinkCategory).filter(link => selectedLinkBm === 'all' || link.bmLimit === selectedLinkBm);
  list.innerHTML = renderLinkCards(shown, isAdmin);
  const balanceNode = document.querySelector('#links-balance');
  if (balanceNode) balanceNode.textContent = money(linksBalanceCents);
  document.querySelector('#links-pending').textContent = String(linksPendingCount);
  const valueLabel = document.querySelector('#link-value-label');
  if (valueLabel && isAdmin) valueLabel.textContent = `${valuePerLinkCents === null ? 'Valor definido individualmente por perfil' : `${money(valuePerLinkCents)} por link aprovado`} · informação administrativa`;
  document.querySelector('#links-total').textContent = `${shown.length} ${shown.length === 1 ? 'link' : 'links'}${isAdmin && selectedLinkStatus !== 'all' ? ` de ${linkItems.length}` : ''}`;
  list.querySelectorAll('[data-link-decision]').forEach(button => button.addEventListener('click', () => decideLink(button.dataset.id, button.dataset.linkDecision)));
  list.querySelectorAll('[data-link-archive]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Arquivar este link aprovado? Ele continuará no histórico e no banco de dados.')) return;
    try { await api(`/api/links/${encodeURIComponent(button.dataset.linkArchive)}/archive`, { method: 'POST', body: '{}' }); notify('Link arquivado no histórico.'); await refreshDashboardPreservingScroll(); }
    catch (error) { notify(error.message); }
  }));
  list.querySelectorAll('[data-link-reanalysis]').forEach(button => button.addEventListener('click', () => requestLinkReanalysis(button.dataset.linkReanalysis)));
}
async function copyLinkForAdmin(button) {
  const target = linkItems.find(link => link.id === button.dataset.linkCopy);
  if (!target) return;
  try { await copyTextToClipboard(target.url); }
  catch (error) { notify(error.message || 'Não foi possível copiar automaticamente.'); return; }
  button.classList.add('copied');
  button.innerHTML = `${svg('check', 13)} Copiado`;
  try {
    const result = await api(`/api/links/${encodeURIComponent(target.id)}/copied`, { method: 'POST' });
    target.copiedAt = result.copiedAt;
    target.copiedBy = result.copiedBy;
    notify('Link copiado e registrado para a equipe administrativa.');
  } catch (error) { notify(`Link copiado. ${error.message || 'Não foi possível salvar o registro para os outros administradores.'}`); }
}
async function loadLinks() {
  try { await fetchLinks(); updateLinksUi(); }
  catch (error) { notify(error.message); }
}
async function submitLink(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.querySelector('#submit-link-button');
  const error = document.querySelector('#link-form-error');
  const fields = new FormData(form);
  button.disabled = true;
  error.classList.remove('show');
  try {
    await api('/api/links', { method: 'POST', body: JSON.stringify({ url: fields.get('url'), label: fields.get('label'), category: fields.get('category'), bmLimit: fields.get('bmLimit') }) });
    form.reset();
    notify('Link enviado para análise.');
    await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function decideLink(id, status) {
  const target = linkItems.find(link => link.id === id);
  if (!target) return;
  const approved = status === 'approved';
  if (!confirm(approved ? `Aprovar ${target.publicId} (${target.category} · BM ${target.bmLimit === '2000' ? '2k' : '250'})? O valor administrativo será registrado para ${target.userName}.` : `Desaprovar ${target.publicId}?`)) return;
  try {
    const result = await api(`/api/links/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ status }) });
    notify(approved ? `Link aprovado. Valor individual atualizado para ${target.userName}.` : 'Link desaprovado.');
    await refreshDashboardPreservingScroll();
  } catch (error) { notify(error.message); }
}
async function requestLinkReanalysis(id) {
  const target = linkItems.find(link => link.id === id);
  if (!target || !confirm(`Pedir ao administrador uma nova análise para ${target.publicId}?`)) return;
  try {
    await api(`/api/links/${encodeURIComponent(id)}/reanalysis`, { method: 'POST', body: '{}' });
    notify('Pedido de reanálise enviado ao administrador.');
    await refreshDashboardPreservingScroll();
  } catch (error) { notify(error.message); }
}
async function refreshDashboardPreservingScroll() {
  const scrollTop = window.scrollY;
  await openDashboard();
  window.scrollTo({ top: scrollTop, behavior: 'instant' });
}
function bindUserActions() {
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    const target = members.find(item => item.id === button.dataset.id);
    if (!target) return;
    if (button.dataset.action === 'login-as') {
      if (!confirm(`Entrar no espaço de ${target.name}? A área administrativa ficará disponível ao retornar.`)) return;
      try { const result = await api(`/api/users/${target.id}/impersonate`, { method: 'POST', body: '{}' }); csrf = result.csrf; current = result.user; await openDashboard(); } catch (error) { notify(error.message); }
    }
    if (button.dataset.action === 'toggle') {
      try { await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ active: !target.active }) }); notify(target.active ? 'Conta desativada.' : 'Conta ativada.'); await openDashboard(); }
      catch (error) { notify(error.message); }
    }
    if (button.dataset.action === 'delete') {
      const accepted = confirm(`Excluir a conta de ${target.name} (@${target.username})? Os links, notificações e fotos dessa conta também serão removidos. Esta ação não pode ser desfeita.`);
      if (!accepted) return;
      try {
        await api(`/api/users/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
        notify(`Conta de ${target.name} excluída.`);
        await openDashboard();
      } catch (error) { notify(error.message); }
    }
    if (button.dataset.action === 'password') showPasswordChange(target);
  }));
}
function scrollAccounts() { document.querySelector('#accounts-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function showModal(html) {
  const layer = document.createElement('div');
  layer.className = 'modal-backdrop';
  layer.innerHTML = html;
  document.body.appendChild(layer);
  layer.addEventListener('click', event => { if (event.target === layer || event.target.closest('[data-close]')) layer.remove(); });
  return layer;
}
function showCreateUser() {
  const modal = showModal(`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="eyebrow">NOVO ACESSO</div><h2 id="modal-title">Adicionar à equipe</h2><p>Crie um login individual para uma pessoa da equipe.</p></div><button class="icon-btn" data-close aria-label="Fechar">${svg('close')}</button></div><form id="create-user-form"><div class="modal-field"><label for="new-name">Nome completo</label><input id="new-name" name="name" placeholder="Ex.: Ana Oliveira" minlength="2" maxlength="80" required></div><div class="modal-field"><label for="new-username">Login</label><input id="new-username" name="username" placeholder="ex.: ana.oliveira" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></div><div class="modal-field"><label for="new-password">Senha inicial</label><input id="new-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required></div><div class="login-error" id="modal-error"></div><div class="modal-actions"><button class="soft-btn" type="button" data-close>Cancelar</button><button class="primary-btn compact" id="create-user-submit" type="submit">Criar acesso ${svg('arrow', 14)}</button></div></form></section>`);
  modal.querySelector('#create-user-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = modal.querySelector('#create-user-submit');
    const error = modal.querySelector('#modal-error');
    button.disabled = true;
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      modal.remove(); notify('Conta criada com sucesso.'); await openDashboard();
    } catch (err) { error.textContent = err.message; error.classList.add('show'); button.disabled = false; }
  });
  modal.querySelector('#new-name').focus();
}
function showPasswordChange(target) {
  const modal = document.createElement('dialog');
  modal.className = 'modal password-modal password-reset-dialog';
  modal.setAttribute('aria-labelledby', 'modal-title');
  modal.innerHTML = `<div class="modal-head"><div><div class="eyebrow">ACESSO DA EQUIPE</div><h2 id="modal-title">Redefinir senha</h2><p>Nova senha para <strong>${escapeHtml(target.name)}</strong>.</p></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${svg('close')}</button></div><form id="change-password-form"><div class="modal-field"><label for="change-password">Nova senha</label><input id="change-password" type="password" name="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required><small class="password-modal-help">Use no mínimo 8 caracteres.</small></div><div class="login-error" id="modal-error"></div><div class="modal-actions"><button class="soft-btn" type="button" data-close>Cancelar</button><button class="primary-btn compact" type="submit">Salvar senha</button></div></form>`;
  document.body.append(modal);
  modal.showModal();
  modal.addEventListener('close', () => modal.remove(), { once: true });
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest?.('[data-close]')) { modal.close(); modal.remove(); }
  });
  modal.querySelector('#change-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    const error = modal.querySelector('#modal-error');
    try { await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ password }) }); modal.close(); modal.remove(); notify('Senha atualizada.'); }
    catch (err) { error.textContent = err.message; error.classList.add('show'); }
  });
}
async function openDashboard() {
  try {
    dashboardData = await api('/api/dashboard', { headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
    current = dashboardData.user;
    if (dashboardData.admin && !dashboardData.impersonating) {
      const result = await api('/api/users', { headers: { 'X-CSRF-Token': csrf } });
      members = result.users;
    } else members = dashboardData.members || [];
    if (dashboardData.admin && !dashboardData.impersonating && selectedLinkUser !== 'all' && !members.some(member => member.id === selectedLinkUser)) selectedLinkUser = 'all';
    await fetchLinks();
    await fetchInsights();
    await refreshNotifications(false);
    if (notificationsTimer) clearInterval(notificationsTimer);
    notificationsTimer = setInterval(() => refreshNotifications(true), 20000);
    renderDashboard();
  } catch (error) {
    if (error.status === 401 || error.status === 403) { csrf = null; current = null; renderLogin(); }
    else { app.innerHTML = `<main class="login-side"><div class="login-card"><div class="login-eyebrow">IMPÉRIO DIGITAL</div><h2>Não foi possível abrir seu espaço.</h2><p class="login-lead">${escapeHtml(error.message)}</p><button class="primary-btn" id="retry-open">Tentar novamente</button></div></main>`; }
  }
}
async function logout() {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  if (notificationsTimer) clearInterval(notificationsTimer); notificationsTimer=null; notificationIds=new Set(); notifications=[]; unreadNotifications=0;
  csrf = null; current = null; dashboardData = null; members = []; activeView = 'overview'; renderLogin();
}
async function returnAdmin() {
  try { const result = await api('/api/return-admin', { method: 'POST', body: '{}' }); csrf = result.csrf; current = result.user; await openDashboard(); notify('Você voltou à administração.'); }
  catch (error) { notify(error.message); }
}
async function start() {
  try {
    const session = await api('/api/session');
    if (session.user) { current = session.user; csrf = session.csrf; if (session.impersonating) dashboardData = { impersonating: true }; await openDashboard(); }
    else renderLogin();
  } catch { renderLogin(); }
}
function profileSection() {
  const role = current?.role === 'admin' ? 'Administrador' : 'Membro da equipe';
  return `<section class="profile-section" id="profile-section"><div class="section-title"><div><h2>Meu perfil</h2><p>Escolha uma foto para identificar sua conta no espaço da equipe.</p></div></div><article class="panel profile-panel"><div class="profile-info">${avatarMarkup(current, 'profile-avatar')}<div class="profile-details"><strong>${escapeHtml(current?.name)}</strong><span>@${escapeHtml(current?.username)}</span><span>${escapeHtml(current?.email || 'E-mail não informado')}</span><small>${role}</small></div></div><div class="profile-photo-actions"><input id="avatar-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"><button class="soft-btn" type="button" id="choose-avatar">${svg('camera', 14)} ${current?.avatar ? 'Trocar foto' : 'Adicionar foto'}</button>${current?.avatar ? `<button class="action-link danger" type="button" id="remove-avatar">Remover foto</button>` : ''}<small>PNG, JPG ou WebP · até 3 MB</small></div></article></section>`;
}
function adminAccountsSection() {
  return `<section class="admin-section" id="accounts-section"><div class="section-title"><div><h2>Contas da equipe</h2><p>Crie acessos e acompanhe as contas registradas.</p></div><div class="admin-toolbar"><input class="search-input" id="user-search" type="search" placeholder="Buscar pessoas…" aria-label="Buscar contas"></div></div><article class="panel create-account-panel"><div class="panel-head"><div><h3>Criar conta</h3><span>O acesso fica disponível assim que for criado.</span></div></div><form id="create-user-form" class="create-account-form"><label class="modal-field"><span>Nome completo</span><input id="new-name" name="name" placeholder="Ex.: Ana Oliveira" minlength="2" maxlength="80" required></label><label class="modal-field"><span>Nome de usuário</span><input id="new-username" name="username" placeholder="ex.: ana.oliveira" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></label><label class="modal-field"><span>E-mail</span><input id="new-email" name="email" type="email" placeholder="ana@empresa.com" maxlength="254" autocomplete="email" required></label><label class="modal-field"><span>Senha inicial</span><input id="new-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required></label><div class="create-account-submit"><div class="login-error" id="account-form-error"></div><button class="primary-btn compact" id="create-user-submit" type="submit">${svg('plus', 14)} Criar conta</button></div></form></article><div class="section-title account-table-title"><div><h2>Contas registradas</h2><p>Entre no espaço de uma pessoa, redefina a senha ou altere o acesso.</p></div></div><article class="panel" style="padding:7px 17px"><div class="table-wrap"><table class="user-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Status</th><th>Adicionada</th><th>Ações</th></tr></thead><tbody id="user-rows">${memberRows(members)}</tbody></table></div></article></section>`;
}
async function createAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#account-form-error');
  const button = document.querySelector('#create-user-submit');
  button.disabled = true; error.classList.remove('show');
  try {
    const fields = Object.fromEntries(new FormData(form));
    await api('/api/users', { method: 'POST', body: JSON.stringify(fields) });
    form.reset(); notify('Conta criada com sucesso.'); await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function saveProfileSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#profile-settings-error');
  const button = form.querySelector('button[type="submit"]');
  error.classList.remove('show'); button.disabled = true;
  try {
    const result = await api('/api/profile', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    current = result.user;
    notify('Dados do perfil atualizados.');
    await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function saveAdminPersonalRate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#admin-personal-rate-error');
  const button = form.querySelector('button[type="submit"]');
  const amount = Number(new FormData(form).get('rate'));
  const rateCents = Math.round(amount * 100);
  error.classList.remove('show');
  if (!Number.isFinite(amount) || rateCents < 1 || rateCents > 10_000_000) {
    error.textContent = 'Informe um valor entre R$ 0,01 e R$ 100.000,00.';
    error.classList.add('show');
    return;
  }
  button.disabled = true;
  try {
    await api('/api/admin/personal-rate', { method: 'PATCH', body: JSON.stringify({ rateCents }) });
    notify('Seu valor por link foi atualizado.');
    await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function savePasswordSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#password-settings-error');
  const button = form.querySelector('button[type="submit"]');
  const fields = Object.fromEntries(new FormData(form));
  error.classList.remove('show'); button.disabled = true;
  try {
    await api('/api/profile/password', { method: 'PATCH', body: JSON.stringify(fields) });
    form.reset(); notify('Senha atualizada.');
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function prepareAvatarData(file) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Não foi possível abrir esta imagem.')); image.src = objectUrl; });
  } finally { URL.revokeObjectURL(objectUrl); }
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('A imagem está vazia ou danificada.');
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar esta imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Não foi possível converter esta imagem.');
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível preparar esta imagem para envio.')); reader.readAsDataURL(blob); });
}
async function uploadAvatar(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return notify('Escolha uma foto PNG, JPG ou WebP.');
  if (file.size > 3 * 1024 * 1024) return notify('A foto precisa ter até 3 MB.');
  try { const data = await prepareAvatarData(file); await api('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ data }) }); notify('Foto de perfil atualizada.'); await refreshDashboardPreservingScroll(); }
  catch (error) { notify(error.message); }
}
async function removeAvatar() {
  try { await api('/api/profile/avatar', { method: 'DELETE' }); notify('Foto de perfil removida.'); await refreshDashboardPreservingScroll(); }
  catch (error) { notify(error.message); }
}
function createAccountView() {
  return `<section class="admin-section" id="accounts-section"><div class="section-title"><div><div class="eyebrow">ADMINISTRAÇÃO DA EQUIPE</div><h2>Nova conta</h2><p>Preencha os dados para liberar um acesso à equipe.</p></div></div><article class="panel create-account-panel"><form id="create-user-form" class="create-account-form"><label class="modal-field"><span>Nome completo</span><input id="new-name" name="name" placeholder="Ex.: Ana Oliveira" minlength="2" maxlength="80" required></label><label class="modal-field"><span>Nome de usuário</span><input id="new-username" name="username" placeholder="ex.: ana.oliveira" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></label><label class="modal-field"><span>E-mail</span><input id="new-email" name="email" type="email" placeholder="ana@empresa.com" maxlength="254" autocomplete="email" required></label><label class="modal-field"><span>Senha inicial</span><input id="new-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required></label><div class="create-account-submit"><div class="login-error" id="account-form-error"></div><button class="primary-btn compact" id="create-user-submit" type="submit">${svg('plus', 14)} Criar conta</button></div></form></article></section>`;
}
function registeredAccountsView() {
  return `<section class="admin-section" id="registered-accounts"><div class="section-title"><div><div class="eyebrow">ADMINISTRAÇÃO DA EQUIPE</div><h2>Contas registradas</h2><p>Consulte o perfil, abra uma conta ou atualize o acesso.</p></div><div class="admin-toolbar"><input class="search-input" id="user-search" type="search" placeholder="Buscar nome, usuário ou e-mail…" aria-label="Buscar contas"></div></div><article class="panel" style="padding:7px 17px"><div class="table-wrap"><table class="user-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Status</th><th>Adicionada</th><th>Ações</th></tr></thead><tbody id="user-rows">${memberRows(members)}</tbody></table></div></article></section>`;
}
function linkValuesView() {
  const team = members.filter(member => member.role !== 'admin');
  return `<section class="admin-section link-values-page"><div class="section-title"><div><div class="eyebrow">ADMINISTRAÇÃO DA EQUIPE</div><h2>Valores por perfil</h2><p>Defina quanto cada pessoa recebe por link aprovado.</p></div></div><article class="panel link-values-intro"><span class="module-icon">${svg('spark', 16)}</span><div><strong>Valor automático na aprovação</strong><p>O valor definido será aplicado ao aprovar os próximos links. Aprovações anteriores mantêm o valor registrado na época.</p></div></article><div class="link-values-list">${team.map(member => `<article class="panel link-value-card" data-rate-row="${escapeHtml(member.id)}">${avatarMarkup(member, 'avatar link-value-avatar')}<div class="link-value-person"><strong>${escapeHtml(member.name)}</strong><small>@${escapeHtml(member.username)}${member.active ? '' : ' · conta inativa'}</small></div><label class="link-value-field"><span>Valor por link</span><span class="currency-input"><b>R$</b><input type="number" min="0.01" max="100000" step="0.01" value="${((member.linkValueCents ?? 5000) / 100).toFixed(2)}" data-link-value="${escapeHtml(member.id)}" aria-label="Valor por link aprovado para ${escapeHtml(member.name)}"></span></label><button class="primary-btn compact" type="button" data-save-link-value="${escapeHtml(member.id)}">Salvar</button></article>`).join('') || '<article class="panel empty-state">Crie uma conta para definir o valor por link.</article>'}</div></section>`;
}
async function saveLinkValue(userId) {
  const input = document.querySelector(`[data-link-value="${CSS.escape(userId)}"]`);
  const button = document.querySelector(`[data-save-link-value="${CSS.escape(userId)}"]`);
  const value = Number(input?.value);
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || cents < 1 || cents > 10_000_000) return notify('Informe um valor entre R$ 0,01 e R$ 100.000,00.');
  button.disabled = true;
  try {
    await api(`/api/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ linkValueCents: cents }) });
    const member = members.find(item => item.id === userId);
    if (member) member.linkValueCents = cents;
    const balance = payoutData.balances.find(item => item.userId === userId);
    if (balance) balance.linkValueCents = cents;
    notify('Valor por link atualizado.');
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}
function adminPersonalSettingsView() {
  if (current?.role !== 'admin' || dashboardData?.impersonating) return '';
  const rate = dashboardData?.adminLinkValueCents ?? 5000;
  const count = dashboardData?.personalApprovedCount ?? 0;
  const balance = dashboardData?.personalBalanceCents ?? count * rate;
  return `<section class="settings-card admin-personal-settings"><div class="settings-card-head"><span class="settings-icon">${svg('spark', 16)}</span><div><h3>Meu saldo pessoal por link</h3><p>Seu ganho pessoal é calculado para cada link aprovado da equipe.</p></div></div><p class="admin-personal-explainer">Cada aprovação soma este valor ao seu total pessoal. O total não diminui ao pagar os membros, e mudanças no valor valem para as próximas aprovações.</p><form id="admin-personal-rate-form" class="settings-form"><label class="modal-field"><span>Quanto recebo por link aprovado?</span><span class="currency-input"><b>R$</b><input name="rate" type="number" min="0.01" max="100000" step="0.01" value="${(rate / 100).toFixed(2)}" required></span></label><div class="admin-personal-balance"><small>Saldo pessoal total · ${count} links aprovados</small><strong>${money(balance)}</strong></div><div class="settings-form-actions"><div class="login-error" id="admin-personal-rate-error"></div><button class="primary-btn compact" type="submit">Salvar meu valor</button></div></form></section>`;
}
function settingsView() {
  const theme = localStorage.getItem('eq_theme') === 'light' ? 'light' : 'dark';
  const compact = localStorage.getItem('eq_compact_mode') === 'true';
  const sound = localStorage.getItem('eq_sound_notifications') !== 'false';
  return `<div class="settings-page"><section class="settings-intro"><div class="eyebrow">PREFERÊNCIAS DA CONTA</div><h2>Configurações</h2><p>Atualize seu perfil, escolha a aparência do painel e proteja seu acesso.</p></section><section class="settings-card"><div class="settings-card-head"><span class="settings-icon">${svg('users', 16)}</span><div><h3>Dados do perfil</h3><p>Seu nome, usuário e e-mail usados pela equipe.</p></div></div><form id="profile-settings-form" class="settings-form"><label class="modal-field"><span>Nome completo</span><input name="name" value="${escapeHtml(current?.name)}" minlength="2" maxlength="80" required></label><label class="modal-field"><span>Nome de usuário</span><input name="username" value="${escapeHtml(current?.username)}" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" required></label><label class="modal-field"><span>E-mail</span><input name="email" type="email" value="${escapeHtml(current?.email || '')}" maxlength="254" required></label><div class="settings-form-actions"><div class="login-error" id="profile-settings-error"></div><button class="primary-btn compact" type="submit">Salvar perfil</button></div></form></section>${profileSection()}${adminPersonalSettingsView()}<section class="settings-card"><div class="settings-card-head"><span class="settings-icon">${svg('spark', 16)}</span><div><h3>Aparência do painel</h3><p>Escolha o tema que fica melhor para você.</p></div></div><div class="theme-options"><label class="theme-option ${theme === 'dark' ? 'selected' : ''}"><input type="radio" name="site-theme" value="dark" ${theme === 'dark' ? 'checked' : ''}><span class="theme-swatch dark-swatch">◐</span><span><strong>Modo escuro</strong><small>Fundo escuro e detalhes azul-bebê</small></span></label><label class="theme-option ${theme === 'light' ? 'selected' : ''}"><input type="radio" name="site-theme" value="light" ${theme === 'light' ? 'checked' : ''}><span class="theme-swatch light-swatch">☼</span><span><strong>Modo claro</strong><small>Fundo claro e detalhes azul-bebê</small></span></label></div><label class="setting-toggle"><span><strong>Layout compacto</strong><small>Reduz os espaços entre os cartões do painel.</small></span><input id="compact-mode" type="checkbox" ${compact ? 'checked' : ''}><i></i></label><label class="setting-toggle"><span><strong>Alertas sonoros</strong><small>Alerta musical tipo mensagem quando chegar algo novo.</small></span><input id="sound-mode" type="checkbox" ${sound ? 'checked' : ''}><i></i></label><div class="sound-test-row"><span><strong>Prévia do alerta</strong><small>Ouça o som de mensagem antes de salvar esta preferência.</small></span><button class="soft-btn" id="test-notification-sound" type="button">Testar som</button></div></section><section class="settings-card"><div class="settings-card-head"><span class="settings-icon">${svg('shield', 16)}</span><div><h3>Senha e segurança</h3><p>${current?.role==='admin'?'Como administrador, você pode definir uma nova senha sem informar a atual.':'Confirme sua senha atual para definir uma nova.'}</p></div></div><form id="password-settings-form" class="settings-form password-settings-form">${current?.role==='admin'?'':`<label class="modal-field"><span>Senha atual</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>`}<label class="modal-field"><span>Nova senha</span><input name="newPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Pelo menos 8 caracteres" required></label><label class="modal-field"><span>Confirme a nova senha</span><input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><div class="settings-form-actions"><div class="login-error" id="password-settings-error"></div><button class="primary-btn compact" type="submit">${current?.role==='admin'?'Redefinir senha':'Atualizar senha'}</button></div></form></section></div>`;
}
function applyUiPreferences() {
  document.documentElement.dataset.theme = localStorage.getItem('eq_theme') === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('compact-mode', localStorage.getItem('eq_compact_mode') === 'true');
}
function overviewView(isAdmin, welcomeName) {
  const activityFilter=isAdmin?`<select class="search-input activity-user-filter" id="activity-user-filter"><option value="all" ${activityUserFilter==='all'?'selected':''}>Toda a equipe</option>${members.filter(item=>item.role!=='admin').map(item=>`<option value="${escapeHtml(item.id)}" ${activityUserFilter===item.id?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select>`:'';
  return `<section class="welcome"><div><div class="eyebrow">${isAdmin ? 'PAINEL DO ADMINISTRADOR' : 'SEU ESPAÇO DE TRABALHO'}</div><h1>Olá, ${welcomeName} <span style="color:var(--mint)">✦</span></h1><p>Um novo dia para fazer boas ideias acontecerem.</p></div><div class="welcome-actions">${isAdmin ? `<button class="soft-btn" data-open-view="accounts">${svg('users', 14)} Ver contas</button><button class="primary-btn compact" data-open-view="create-account">${svg('plus', 14)} Nova conta</button>` : `<button class="soft-btn" id="copy-login">${svg('copy', 14)} Copiar meu login</button>`}<button class="soft-btn" data-open-view="ranking">${svg('chart', 14)} Ranking</button><button class="soft-btn" data-open-view="links">${svg('link', 14)} ${isAdmin ? 'Analisar links' : 'Meus links'}</button></div></section><section class="metrics ${isAdmin ? 'metrics-admin' : ''}">${(dashboardData?.stats || []).map(metricCard).join('')}</section><section><div class="section-title"><div><h2>Ritmo da operação</h2><p>${activityData.links||0} links enviados · ${activityData.approved||0} aprovados nesta visão</p></div>${activityFilter}</div><div class="content-grid"><article class="panel"><div class="panel-head"><h3>Movimento dos links</h3><span>Últimos 7 dias</span></div>${chartMarkup()}</article><article class="panel"><div class="panel-head"><h3>Camada de inteligência</h3><span class="module-state"><i></i> Conectada</span></div><div class="module-list"><div class="module-row"><span class="module-icon">${svg('spark', 15)}</span><span class="module-copy"><strong>Equipe em movimento</strong><small>Ranking e atividade atualizados</small></span><span class="module-state"><i></i> Ativo</span></div><div class="module-row"><span class="module-icon purple">${svg('shield', 15)}</span><span class="module-copy"><strong>Acesso protegido</strong><small>Contas geridas pelo administrador</small></span><span class="module-state"><i></i> Seguro</span></div></div></article></div><div class="access-banner"><span class="access-icon">${svg('lock', 16)}</span><span class="access-copy"><strong>${isAdmin ? 'Acesso administrativo' : 'Acesso individual'}</strong><p>${isAdmin ? 'As áreas de contas e análise de links estão disponíveis no menu.' : 'Seu login é pessoal. O administrador pode ajudar com alterações de acesso.'}</p></span>${isAdmin ? `<span class="role-pill">Administrador</span>` : `<span class="role-pill">${escapeHtml(current?.username)}</span>`}</div></section>`;
}
function tutorialView() {
  const steps = [
    { number: '01', title: 'Criação da BM', blocks: [{ title: 'Primeiro passo', items: ['Acessar o Facebook pelo link de criação do Gerenciador de Negócios.', 'Selecionar a opção para criar uma nova BM.', 'Informar o nome da empresa.', 'Inserir um e-mail válido ao qual tenha acesso.', 'Finalizar a criação.'] }], finish: 'BM criada!', images: [{ src: '/tutorial/passo-01-facebook.png', alt: 'Acesso ao Facebook', note: 'Acesse com uma conta autorizada e mantenha seus dados de login privados.' }, { src: '/tutorial/passo-02-criar-bm.png', alt: 'Criação do Gerenciador de Negócios', note: 'Use um e-mail válido e acessível. O exemplo da imagem é apenas ilustrativo.' }] },
    { number: '02', title: 'Configurações da empresa', blocks: [{ title: 'Primeiro passo', items: ['Acessar a BM recém-criada.', 'Entrar em Configurações.', 'Selecionar Informações da empresa.'] }, { title: 'Segundo passo', items: ['Preencher razão social, país, endereço, cidade, estado, CEP, telefone empresarial autorizado e site oficial da empresa.', 'Conferir se todas as informações correspondem aos documentos oficiais da empresa.'] }], images: [{ src: '/tutorial/passo-03-informacoes-empresa.png', alt: 'Abertura das informações da empresa', note: 'Os nomes dos menus podem variar conforme a versão da Meta.' }, { src: '/tutorial/passo-04-dados-empresa.png', alt: 'Formulário de dados empresariais', note: 'Preencha os campos conforme os registros oficiais da empresa.' }, { src: '/tutorial/referencia-consulta-cnpj.png', alt: 'Imagem ilustrativa de consulta de dados cadastrais de CNPJ', note: 'Referência visual enviada pela equipe. Confira os dados em fontes confiáveis e use somente o cadastro da própria empresa.' }] },
    { number: '03', title: 'Configuração da conta do WhatsApp', blocks: [{ items: ['Acessar Contas do WhatsApp.', 'Clicar em Adicionar.', 'Selecionar Criar conta do WhatsApp.', 'Escolher a categoria correspondente à atividade empresarial.', 'Configurar o número de exibição com um número autorizado e controlado pela empresa.', 'Finalizar a criação da conta.'] }], images: [{ src: '/tutorial/passo-05-whatsapp.png', alt: 'Adição de uma conta do WhatsApp à BM', note: 'Receba códigos somente nos canais autorizados e controlados pela empresa.' }] },
    { number: '04', title: 'Verificação da empresa', blocks: [{ items: ['Acessar Contas de mensagens, selecionar Iniciar verificação e clicar em Começar.', 'Avançar pelas etapas de identificação empresarial.', 'Informar o tipo correto de empresa e selecionar empresa registrada quando aplicável.', 'Inserir o CNPJ correspondente e confirmar os dados cadastrais.', 'Escolher um método de verificação disponibilizado pela Meta.', 'Enviar os documentos empresariais originais solicitados.', 'Confirmar o telefone empresarial, caso solicitado.', 'Receber o código pelo canal autorizado e inseri-lo no campo indicado.', 'Aguardar a análise da Meta.'] }], images: [{ src: '/tutorial/passo-06-verificacao.png', alt: 'Etapas de verificação empresarial no WhatsApp', note: 'O envio não garante aprovação. A Meta analisa cada solicitação e pode pedir outras informações.' }] },
    { number: '05', title: 'Adicionar pessoas à BM', intro: 'Após concluir as configurações:', blocks: [{ items: ['Acessar a seção Pessoas e clicar em Convidar pessoas.', 'Inserir o e-mail da pessoa que receberá o acesso.', 'Clicar em Avançar.', 'Selecionar somente as permissões necessárias para as atividades que serão realizadas.', 'Enviar o convite.'] }] },
    { number: '06', title: 'Finalização', intro: 'Antes de considerar o processo concluído, verificar:', blocks: [{ items: ['BM criada.', 'Informações empresariais preenchidas.', 'Conta do WhatsApp adicionada.', 'Verificação empresarial enviada, quando solicitada.', 'Documentos legítimos anexados, quando solicitados.', 'Telefone confirmado, quando solicitado.', 'Pessoas convidadas com as permissões adequadas.'] }], finish: 'Processo finalizado após a conferência e a análise da Meta.' },
  ];
  return `<section class="tutorial-page"><div class="tutorial-hero"><div><span class="eyebrow">GUIA DA EQUIPE</span><h1>Criar e configurar uma BM</h1><p>Script de criação e configuração do portfólio empresarial e da conta do WhatsApp.</p></div><div class="tutorial-hero-actions"><a class="primary-btn compact tutorial-official-link" href="${META_CREATE_PORTFOLIO_URL}" target="_blank" rel="noopener noreferrer">${svg('plus', 14)} Criar Portfólio</a><a class="soft-btn tutorial-official-link" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">Abrir Meta Business Suite ${svg('arrow', 14)}</a></div></div>
    <div class="tutorial-notice">${svg('shield', 18)}<div><strong>Use informações e documentos verdadeiros</strong><p>Os dados devem corresponder à empresa titular. A Meta define os requisitos e o resultado de cada análise.</p></div></div>
    <section class="tutorial-video panel"><div class="tutorial-video-copy"><span class="eyebrow">VÍDEO DE APOIO</span><h2>Orientação em vídeo</h2><p>O vídeo institucional é servido diretamente dos arquivos do projeto, sem gravar mídia no banco de dados.</p></div><div class="tutorial-media"><div class="tutorial-video-placeholder" aria-label="Vídeo de orientação será adicionado aqui"><span>${svg('play', 34)}</span><strong>Vídeo em breve</strong><small>Adicione <code>public/tutorial/bm-configuracao.mp4</code> ao projeto</small></div><video class="tutorial-player" controls preload="metadata" aria-label="Tutorial em vídeo sobre configuração da BM"><source src="/tutorial/bm-configuracao.mp4" type="video/mp4">Seu navegador não consegue reproduzir este vídeo.</video></div></section>
    <div class="section-title tutorial-section-title"><div><h2>Script de criação e configuração de BM</h2><p>Confira cada etapa antes de avançar.</p></div><span class="tutorial-count">${steps.length} etapas</span></div>
    <div class="tutorial-steps">${steps.map(step => `<article class="tutorial-step panel ${step.images ? 'has-images' : ''}"><span class="tutorial-step-number">${step.number}</span><div class="tutorial-step-content"><h3>${step.title}</h3>${step.intro ? `<strong class="tutorial-step-intro">${step.intro}</strong>` : ''}${step.blocks.map(block => `${block.title ? `<strong class="tutorial-step-intro">${block.title}</strong>` : ''}<ul class="tutorial-step-bullets">${block.items.map(item => `<li>${item}</li>`).join('')}</ul>`).join('')}${step.finish ? `<strong class="tutorial-step-finish">${step.finish}</strong>` : ''}</div>${step.images ? `<div class="tutorial-step-images">${step.images.map(image => `<figure><img src="${image.src}" alt="${image.alt}" loading="lazy"><figcaption>${image.note}</figcaption></figure>`).join('')}</div>` : ''}</article>`).join('')}</div>
    <div class="tutorial-footer-note"><strong>Segurança:</strong> não compartilhe senhas nem códigos de confirmação. A aprovação depende da análise oficial da Meta.</div></section>`;
}function renderDashboard() {
  const isAdmin = current?.role === 'admin' && !dashboardData?.impersonating;
  if (!isAdmin && !['overview', 'links', 'settings', 'ranking', 'tutorial'].includes(activeView)) activeView = 'overview';
  const welcomeName = escapeHtml(current?.name?.split(' ')[0] || 'equipe');
  const pendingBadge = dashboardData?.pendingCount ? String(dashboardData.pendingCount) : '';
  const pageTitles = { overview: 'Visão geral', 'create-account': 'Criar conta', accounts: 'Contas registradas', rates: 'Valores por perfil', links: isAdmin ? 'Gestão de links' : 'Meus links', ranking: 'Ranking', access: 'Histórico de acessos', tutorial: 'Tutoriais', settings: 'Configurações' };
  const page = activeView === 'overview' ? overviewView(isAdmin, welcomeName)
    : activeView === 'create-account' && isAdmin ? createAccountView()
    : activeView === 'accounts' && isAdmin ? registeredAccountsView()
    : activeView === 'rates' && isAdmin ? linkValuesView()
    : activeView === 'links' ? linkSection(isAdmin)
    : activeView === 'ranking' ? rankingView()
    : activeView === 'access' && isAdmin ? accessView()
    : activeView === 'tutorial' ? tutorialView()
    : activeView === 'settings' ? settingsView()
    : overviewView(isAdmin, welcomeName);
  const navigation = isAdmin
    ? `${navItem('overview', 'Métricas', 'grid')}${navItem('create-account', 'Criar conta', 'plus')}${navItem('accounts', 'Gestão de contas', 'users', String(members.filter(member => member.role !== 'admin').length))}${navItem('rates', 'Valores dos links', 'spark')}${navItem('links', 'Gestão de links', 'link', pendingBadge)}${navItem('ranking', 'Ranking', 'chart')}${navItem('tutorial', 'Tutoriais', 'book')}${navItem('access', 'Histórico de acessos', 'shield')}${navItem('settings', 'Configurações', 'settings')}`
    : `${navItem('overview', 'Visão geral', 'grid')}${navItem('links', 'Meus links', 'link', pendingBadge)}${navItem('ranking', 'Ranking', 'chart')}${navItem('tutorial', 'Tutoriais', 'book')}${navItem('settings', 'Configurações', 'settings')}`;
  app.innerHTML = `<div class="dashboard">${dashboardData?.impersonating ? `<div class="impersonate-banner" style="grid-column:1/-1"><span>Você está visualizando o espaço de <strong>${escapeHtml(current.name)}</strong>.</span><button class="soft-btn" id="return-admin">${svg('arrow', 13)} Voltar à administração</button></div>` : ''}<aside class="sidebar"><div class="sidebar-brand">${brand()}</div><div class="side-label">Espaço de trabalho</div><nav class="nav">${navigation}</nav><div class="sidebar-bottom"><div class="workspace-card"><div class="workspace-card-head"><span class="workspace-icon">${svg('wave', 15)}</span><strong>Operação organizada</strong></div><p>Links, equipe e métricas da Império Digital em um só lugar.</p></div><div class="side-profile">${avatarMarkup(current)}<span class="profile-copy"><strong>${escapeHtml(current?.name)}</strong><small>${isAdmin ? 'Administrador' : 'Membro da equipe'}</small></span><button class="icon-btn" title="Sair da conta" id="logout">${svg('logout', 15)}</button></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">IMPÉRIO DIGITAL&nbsp; / &nbsp;<b>${pageTitles[activeView] || 'Visão geral'}</b></div><div class="top-actions"><span class="top-time">${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date())}</span><div class="notification-wrap"><button class="notification-toggle" id="notification-toggle" title="Notificações">${svg('bell', 17)}<span id="notification-count" class="notification-count" ${unreadNotifications?'':'hidden'}>${unreadNotifications>9?'9+':unreadNotifications}</span></button><div class="notification-panel" id="notification-panel">${notificationMarkup()}</div></div></div></header><div class="page">${page}</div></main></div>`;
  document.querySelector('#logout')?.addEventListener('click', logout);
  document.querySelector('#return-admin')?.addEventListener('click', returnAdmin);
  bindNotificationActions();
  const tutorialPlayer = document.querySelector('.tutorial-player');
  tutorialPlayer?.addEventListener('loadeddata', () => {
    tutorialPlayer.previousElementSibling?.setAttribute('hidden', '');
    tutorialPlayer.classList.add('is-ready');
  }, { once: true });
  document.querySelectorAll('[data-nav],[data-open-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.nav || button.dataset.openView;
    if (view === 'security') return notify('Sua sessão está protegida.');
    activeView = view;
    renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  document.querySelector('#create-user-form')?.addEventListener('submit', createAccount);
  document.querySelector('#admin-personal-rate-form')?.addEventListener('submit', saveAdminPersonalRate);
  document.querySelectorAll('[data-save-link-value]').forEach(button => button.addEventListener('click', () => saveLinkValue(button.dataset.saveLinkValue)));
  document.querySelector('#profile-settings-form')?.addEventListener('submit', saveProfileSettings);
  document.querySelector('#password-settings-form')?.addEventListener('submit', savePasswordSettings);
  document.querySelectorAll('input[name="site-theme"]').forEach(input => input.addEventListener('change', event => {
    const theme = event.currentTarget.value === 'light' ? 'light' : 'dark';
    localStorage.setItem('eq_theme', theme); applyUiPreferences();
    document.querySelectorAll('.theme-option').forEach(option => option.classList.toggle('selected', option.querySelector('input')?.checked));
    notify(theme === 'light' ? 'Modo claro ativado.' : 'Modo escuro ativado.');
  }));
  document.querySelector('#compact-mode')?.addEventListener('change', event => {
    localStorage.setItem('eq_compact_mode', String(event.currentTarget.checked)); applyUiPreferences();
    notify(event.currentTarget.checked ? 'Layout compacto ativado.' : 'Layout padrão ativado.');
  });
  document.querySelector('#sound-mode')?.addEventListener('change', event => { localStorage.setItem('eq_sound_notifications',String(event.currentTarget.checked)); notify(event.currentTarget.checked?'Alertas sonoros ativados.':'Alertas sonoros desativados.'); if(event.currentTarget.checked) playNotificationSound(true); });
  document.querySelector('#test-notification-sound')?.addEventListener('click', () => playNotificationSound(true));
  document.querySelector('#activity-user-filter')?.addEventListener('change',async event=>{activityUserFilter=event.currentTarget.value;await fetchInsights();renderDashboard();});
  document.querySelector('#ranking-period')?.addEventListener('change',async event=>{rankingPeriod=event.currentTarget.value;await fetchInsights();renderDashboard();});
  document.querySelector('#access-user-filter')?.addEventListener('change',async event=>{accessUserFilter=event.currentTarget.value;await fetchInsights();renderDashboard();});
  document.querySelector('#user-search')?.addEventListener('input', event => {
    const query = event.currentTarget.value.toLowerCase().trim();
    document.querySelector('#user-rows').innerHTML = memberRows(members.filter(member => `${member.name} ${member.username} ${member.email || ''}`.toLowerCase().includes(query)));
    bindUserActions();
  });
  document.querySelector('#choose-avatar')?.addEventListener('click', () => document.querySelector('#avatar-file').click());
  document.querySelector('#avatar-file')?.addEventListener('change', uploadAvatar);
  document.querySelector('#remove-avatar')?.addEventListener('click', removeAvatar);
  document.querySelector('#export-links')?.addEventListener('click', () => {
    const target = isAdmin && selectedLinkUser === 'all' ? { name: 'Toda a equipe', username: 'equipe' } : (isAdmin ? members.find(member => member.id === selectedLinkUser) : current);
    downloadLinksText(linkItems, target || current, isAdmin); notify('Arquivo TXT gerado.');
  });
  document.querySelector('#download-backup')?.addEventListener('click', async () => {
    try {
      const snapshot = await api('/api/admin/backup', { headers: { 'X-CSRF-Token': csrf } });
      const file = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(file); anchor.download = `imperio-digital-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); notify('Backup baixado com sucesso.');
    } catch (error) { notify(error.message); }
  });
  document.querySelector('#link-user-filter')?.addEventListener('change', async event => { selectedLinkUser = event.currentTarget.value; await loadLinks(); });
  document.querySelector('#link-status-filter')?.addEventListener('change', event => { selectedLinkStatus = event.currentTarget.value; updateLinksUi(); });
  document.querySelector('#link-category-filter')?.addEventListener('change', event => { selectedLinkCategory = event.currentTarget.value; updateLinksUi(); });
  document.querySelector('#link-bm-filter')?.addEventListener('change', event => { selectedLinkBm = event.currentTarget.value; updateLinksUi(); });
  document.querySelector('#link-archive-toggle')?.addEventListener('click', async () => { showLinkArchive = !showLinkArchive; await loadLinks(); renderDashboard(); });
  document.querySelectorAll('[data-payout-user]').forEach(button=>button.addEventListener('click',async()=>{const target=payoutData.balances.find(item=>item.userId===button.dataset.payoutUser);if(!target||!confirm(`Registrar pagamento ilustrativo de ${money(target.balanceCents)} para ${target.name}? Os links aprovados sairão da lista ativa.`))return;try{await api('/api/payouts',{method:'POST',body:JSON.stringify({userId:target.userId})});notify('Pagamento ilustrativo registrado.');await refreshDashboardPreservingScroll()}catch(error){notify(error.message)}}));
  document.querySelector('#submit-link-form')?.addEventListener('submit', submitLink);
  document.querySelectorAll('[data-link-decision]').forEach(button => button.addEventListener('click', () => decideLink(button.dataset.id, button.dataset.linkDecision)));
  document.querySelectorAll('[data-link-reanalysis]').forEach(button => button.addEventListener('click', () => requestLinkReanalysis(button.dataset.linkReanalysis)));
  document.querySelectorAll('[data-link-archive]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Arquivar este link aprovado? Ele continuará no histórico e no banco de dados.')) return;
    try { await api(`/api/links/${encodeURIComponent(button.dataset.linkArchive)}/archive`, { method: 'POST', body: '{}' }); notify('Link arquivado no histórico.'); await refreshDashboardPreservingScroll(); }
    catch (error) { notify(error.message); }
  }));
  document.querySelector('#copy-login')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(current.username); notify('Login copiado.'); } catch { notify(`Seu login é ${current.username}`); } });
  document.querySelector('#refresh-panel')?.addEventListener('click', async event => { event.preventDefault(); await refreshDashboardPreservingScroll(); notify('Painel atualizado.'); });
  if (activeView === 'accounts') bindUserActions();
}
document.addEventListener('click', event => {
  if (event.target.closest?.('#retry-open')) { location.reload(); return; }
  const button = event.target.closest?.('[data-link-copy]');
  if (button) copyLinkForAdmin(button);
});
document.addEventListener('error', event => {
  const image = event.target;
  if (image?.matches?.('[data-avatar-image]')) { image.parentElement.classList.remove('has-photo'); image.remove(); }
}, true);
applyUiPreferences();
start();
