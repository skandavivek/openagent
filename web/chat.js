const API_BASE = "http://localhost:8000";

const sessionId = crypto.randomUUID();

const toggleBtn = document.getElementById("chat-toggle");
const closeBtn = document.getElementById("chat-close");
const panel = document.getElementById("chat-panel");
const messagesEl = document.getElementById("chat-messages");
const inputEl = document.getElementById("chat-input");
const sendBtn = document.getElementById("chat-send");

let greeted = false;

function openChat() {
  panel.classList.add("open");
  if (!greeted) {
    greeted = true;
    addBotMessage(
      "Hi! I'm the OpenAgent concierge. Tell me what you're in the mood for " +
      "(cuisine, neighborhood, party size, date/time) and I can find a table " +
      "or book one for you."
    );
  }
}

toggleBtn.addEventListener("click", () => {
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) openChat();
});

closeBtn.addEventListener("click", () => panel.classList.remove("open"));

sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Promo banner CTA just opens the chat and hands focus to the input.
const promoCta = document.getElementById("promo-cta");
if (promoCta) {
  promoCta.addEventListener("click", () => {
    openChat();
    inputEl.focus();
  });
}

// Clicking a time chip on a restaurant card drafts a booking message into
// the chat input instead of pretending to book directly on the page --
// the chat is the only thing in this demo actually wired to a backend.
document.querySelectorAll(".card .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const card = pill.closest(".card");
    const name = card.querySelector("h3").textContent.trim();
    const time = pill.textContent.trim();
    openChat();
    inputEl.value = `Book ${name} today at ${time} for 2 people`;
    inputEl.focus();
  });
});

function addMessage(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function addBotMessage(text) {
  return addMessage(text, "bot");
}

function addToolTrace(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return;
  const wrap = document.createElement("div");
  wrap.className = "tool-trace";
  for (const call of toolCalls) {
    const chip = document.createElement("div");
    chip.className = "tool-chip";
    const isRead = call.tool.startsWith("search") || call.tool.startsWith("get");
    const iconId = isRead ? "#icon-search" : "#icon-edit";
    chip.innerHTML = `<svg class="icon-sm"><use href="${iconId}"></use></svg> <span class="name">${escapeHtml(call.tool)}</span>(${escapeHtml(
      JSON.stringify(call.input)
    )})`;
    chip.title = call.result;
    wrap.appendChild(chip);
  }
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addTraceLink(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "trace-link";
  link.textContent = "View this turn's trace in Langfuse ->";
  messagesEl.appendChild(link);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  sendBtn.disabled = true;

  addMessage(text, "user");
  const typingEl = addMessage("Concierge is thinking…", "typing");

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();

    typingEl.remove();
    addToolTrace(data.tool_calls);
    addBotMessage(data.reply);
    if (data.trace_url) addTraceLink(data.trace_url);
  } catch (err) {
    typingEl.remove();
    addBotMessage(
      `Sorry, I couldn't reach the concierge service (${err.message}). ` +
      `Is the chat_service backend running on ${API_BASE}?`
    );
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}
