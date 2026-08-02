export function getRoute() {
  return window.location.hash === "#/chat" ? "chat" : "home";
}

export function goChat() {
  window.location.hash = "#/chat";
}

export function goHome() {
  if (window.location.hash === "#/chat") {
    window.history.back();
  }
  window.location.hash = "";
}
