/* global document, fetch, AbortController */

(function() {
  const cfgScript = document.querySelector('script.next-config[data-name="ai_assistant"]');
  if (!cfgScript) return;

  let cfg = null;
  try {
    cfg = JSON.parse(cfgScript.textContent || '{}');
  } catch (e) {
    return;
  }

  if (cfg.mode === 'link') {
    const toggleBtn = document.getElementById('ai-assistant-toggle');
    const modalEl = document.getElementById('ai-assistant-modal');
    const closeBtn = document.getElementById('ai-assistant-close');
    if (!toggleBtn || !modalEl || !closeBtn) return;

    function open() {
      modalEl.classList.add('is-open');
    }

    function close() {
      modalEl.classList.remove('is-open');
    }

    toggleBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });
    return;
  }

  // chat / hybrid: normalize Authorization (allow sk-xxx without Bearer prefix)
  let authRaw = String(cfg.authorization || '').trim();
  if (authRaw && !/^Bearer\s+/i.test(authRaw)) {
    authRaw = 'Bearer ' + authRaw;
  }
  cfg.authorization = authRaw;

  const toggleBtn = document.getElementById('ai-assistant-toggle');
  const modalEl = document.getElementById('ai-assistant-modal');
  const closeBtn = document.getElementById('ai-assistant-close');
  const messagesEl = document.getElementById('ai-assistant-messages');
  const inputEl = document.getElementById('ai-assistant-input');
  const sendBtn = document.getElementById('ai-assistant-send');
  const clearBtn = document.getElementById('ai-assistant-clear');

  if (!toggleBtn || !modalEl || !messagesEl || !inputEl || !sendBtn || !clearBtn) return;

  const endpoint = cfg.endpoint || '/api/chat';
  const model = cfg.model || 'gpt-3.5-turbo';
  const systemPrompt = cfg.system_prompt || '';
  const temperature = Number.isFinite(cfg.temperature) ? cfg.temperature : 0.7;
  const historyTurns = Number.isFinite(cfg.history_turns) ? cfg.history_turns : 6;
  const authorization = cfg.authorization || '';

  const history = [];
  let busy = false;

  function escapeText(text) {
    // We render via textContent/innerText, so escaping is not required here.
    return text == null ? '' : String(text);
  }

  function endpointIsPlaceholder(ep) {
    const u = String(ep || '').toLowerCase();
    return (
      u.includes('your_worker') ||
      u.includes('your-worker') ||
      u.includes('example.com') ||
      u.includes('changeme') ||
      u.includes('占位')
    );
  }

  function placeholderEndpointHint() {
    return (
      '当前 endpoint 仍是占位符（或无效地址），无法发起请求。' +
      '请按仓库的 GitHub Actions 远端部署流程：在仓库 Secrets 配置 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID、MAAS_AUTH 后推送 main。' +
      '待工作流中的 Deploy Worker 成功后，把 Worker 的真实地址（https://<name>.<subdomain>.workers.dev/）替换 _config.next.yml 里 ai_assistant.endpoint，再重新部署博客。' +
      '若暂不部署 Worker，可将 ai_assistant.mode 改为 link，仅保留「打开通义千问」按钮。'
    );
  }

  function formatFetchError(err) {
    const msg = err && err.message ? err.message : String(err);
    if (endpointIsPlaceholder(endpoint)) {
      return placeholderEndpointHint();
    }
    if (/failed to fetch|networkerror|load failed|aborted|fetch/i.test(msg)) {
      return (
        '请求失败（常见：endpoint 未改成真实 Worker 地址，或 GitHub Pages 跨域无法直连百炼）。' +
        '请确认 _config.next.yml 的 endpoint 为 wrangler deploy 后得到的 https://xxx.workers.dev/；密钥在 Worker 的 MAAS_AUTH。'
      );
    }
    return msg;
  }

  function makeMessage(role, content, extraClass) {
    const wrap = document.createElement('div');
    wrap.className = `ai-msg ${role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}`;

    const bubble = document.createElement('div');
    bubble.className = `ai-bubble ${extraClass || ''}`.trim();
    bubble.textContent = escapeText(content);

    wrap.appendChild(bubble);
    return wrap;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function dashscopeNoKeyBlock(text) {
    const ep = String(endpoint || '');
    const auth = String(authorization || '').trim();
    const needsKey =
      ep.includes('dashscope') ||
      ep.includes('maas.aliyuncs.com') ||
      ep.includes('compatible-mode') ||
      ep.includes('compatible-model');
    if (auth || !needsKey) return false;
    messagesEl.appendChild(makeMessage('user', text));
    messagesEl.appendChild(
      makeMessage(
        'assistant',
        '未配置 API Key：请在 _config.next.yml 的 ai_assistant.authorization 中填写 Bearer sk-…，保存后重新 hexo generate。'
      )
    );
    inputEl.value = '';
    sendBtn.disabled = true;
    scrollToBottom();
    return true;
  }

  function open() {
    modalEl.classList.add('is-open');
    // Focus after a tick so the browser applies focus correctly.
    setTimeout(() => inputEl.focus(), 0);
  }

  function close() {
    modalEl.classList.remove('is-open');
    busy = false;
    if (sendBtn) sendBtn.disabled = false;
  }

  toggleBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) close();
  });

  clearBtn.addEventListener('click', () => {
    history.length = 0;
    messagesEl.innerHTML = '';
    inputEl.value = '';
    sendBtn.disabled = true;
    inputEl.focus();
  });

  inputEl.addEventListener('input', () => {
    sendBtn.disabled = busy || inputEl.value.trim().length === 0;
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    e.preventDefault();
    sendBtn.click();
  });

  sendBtn.addEventListener('click', async () => {
    if (busy) return;
    const text = inputEl.value.trim();
    if (!text) return;

    if (dashscopeNoKeyBlock(text)) return;

    if (endpointIsPlaceholder(endpoint)) {
      messagesEl.appendChild(makeMessage('user', text));
      messagesEl.appendChild(makeMessage('assistant', placeholderEndpointHint()));
      inputEl.value = '';
      sendBtn.disabled = true;
      scrollToBottom();
      return;
    }

    busy = true;
    sendBtn.disabled = true;

    // Append user message
    messagesEl.appendChild(makeMessage('user', text));
    scrollToBottom();
    inputEl.value = '';

    history.push({ role: 'user', content: text });

    // Append assistant placeholder
    const assistantWrap = makeMessage('assistant', 'Thinking...');
    messagesEl.appendChild(assistantWrap);
    scrollToBottom();

    try {
      const trimmed = history.slice(-historyTurns * 2);
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push(...trimmed);

      const headers = { 'Content-Type': 'application/json' };
      if (authorization) headers.Authorization = authorization;

      const body = {
        model,
        messages,
        temperature,
        stream: false
      };

      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = ac ? setTimeout(() => ac.abort(), 60000) : null;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ac ? ac.signal : undefined
      });

      if (timeout) clearTimeout(timeout);

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || res.statusText || 'Request failed';
        throw new Error(msg);
      }

      const reply =
        data?.choices?.[0]?.message?.content ||
        data?.reply ||
        data?.output_text ||
        data?.text ||
        '';

      if (!reply) throw new Error('Empty response');

      // Replace assistant message text
      const bubble = assistantWrap.querySelector('.ai-bubble');
      if (bubble) bubble.textContent = escapeText(reply);

      history.push({ role: 'assistant', content: reply });
      scrollToBottom();
    } catch (err) {
      const bubble = assistantWrap.querySelector('.ai-bubble');
      if (bubble) bubble.textContent = `Error: ${escapeText(formatFetchError(err))}`;
    } finally {
      busy = false;
      sendBtn.disabled = inputEl.value.trim().length === 0;
      inputEl.focus();
    }
  });
})();

