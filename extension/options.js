const input = document.getElementById("server");
const status = document.getElementById("status");
document.getElementById("id").textContent = `chrome-extension://${chrome.runtime.id}`;

chrome.storage.sync.get({ fihristServer: "http://localhost:3000" }, ({ fihristServer }) => {
  input.value = fihristServer;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "") || "http://localhost:3000";
  await chrome.storage.sync.set({ fihristServer: value });
  status.textContent = `Saved — using ${value}`;
});
