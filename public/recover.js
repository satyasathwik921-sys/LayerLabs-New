const activeSite = new URL("https://layer-labs-new-git-layerlabs-redesign-layer-labs.vercel.app/");
const destination = new URL(
  window.location.pathname + window.location.search + window.location.hash,
  activeSite
);
const continueLink = document.getElementById("continue");
if (continueLink) continueLink.href = destination.href;
if (window.location.origin !== activeSite.origin) {
  window.location.replace(destination.href);
}
