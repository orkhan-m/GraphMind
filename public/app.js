const chatEl = document.getElementById("chat");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("question");

function addMessage(text, role) {
  const el = document.createElement("div");
  el.className = `msg msg--${role}`;
  el.textContent = text;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = inputEl.value.trim();
  if (!question) return;

  addMessage(question, "user");
  inputEl.value = "";
  inputEl.disabled = true;
  formEl.querySelector("button").disabled = true;

  const pending = addMessage("Researching onchain data...", "pending");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();

    pending.remove();
    if (!res.ok) {
      addMessage(data.error || "Something went wrong.", "error");
    } else {
      addMessage(data.answer, "agent");
    }
  } catch (err) {
    pending.remove();
    addMessage(`Request failed: ${err.message}`, "error");
  } finally {
    inputEl.disabled = false;
    formEl.querySelector("button").disabled = false;
    inputEl.focus();
  }
});
