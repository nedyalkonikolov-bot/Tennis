(function () {
  var storageKey = "tennistipz_cookie_consent";
  var grantedConsent = {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted"
  };
  var deniedConsent = {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  };

  function getChoice() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(storageKey, choice);
    } catch (error) {
      return;
    }
  }

  function updateGoogleConsent(choice) {
    if (typeof window.gtag !== "function") return;
    window.gtag("consent", "update", choice === "accepted" ? grantedConsent : deniedConsent);
  }

  function removeBanner() {
    var banner = document.querySelector("[data-cookie-banner]");
    if (banner) banner.remove();
  }

  function showSettingsButton() {
    if (document.querySelector("[data-cookie-settings]")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "cookie-settings-button";
    button.setAttribute("data-cookie-settings", "");
    button.textContent = "Cookie settings";
    button.addEventListener("click", function () {
      removeBanner();
      showBanner(true);
    });
    document.body.appendChild(button);
  }

  function applyChoice(choice) {
    saveChoice(choice);
    updateGoogleConsent(choice);
    removeBanner();
    showSettingsButton();
  }

  function showBanner(isSettings) {
    if (document.querySelector("[data-cookie-banner]")) return;

    var banner = document.createElement("section");
    banner.className = "cookie-banner";
    banner.setAttribute("data-cookie-banner", "");
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Cookie consent");

    var copy = document.createElement("div");
    copy.className = "cookie-banner-copy";

    var title = document.createElement("h2");
    title.textContent = isSettings ? "Cookie settings" : "We use cookies";

    var text = document.createElement("p");
    text.textContent = "TennisTipz uses Google Analytics cookies to understand traffic and improve the site. You can accept analytics cookies or keep them disabled. Essential cookies stay on for site security and basic functions.";

    copy.appendChild(title);
    copy.appendChild(text);

    var actions = document.createElement("div");
    actions.className = "cookie-banner-actions";

    var reject = document.createElement("button");
    reject.type = "button";
    reject.className = "cookie-button cookie-button-secondary";
    reject.textContent = "Reject analytics";
    reject.addEventListener("click", function () {
      applyChoice("rejected");
    });

    var accept = document.createElement("button");
    accept.type = "button";
    accept.className = "cookie-button cookie-button-primary";
    accept.textContent = "Accept analytics";
    accept.addEventListener("click", function () {
      applyChoice("accepted");
    });

    actions.appendChild(reject);
    actions.appendChild(accept);
    banner.appendChild(copy);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function initConsentBanner() {
    var choice = getChoice();
    if (choice === "accepted" || choice === "rejected") {
      updateGoogleConsent(choice);
      showSettingsButton();
      return;
    }
    showBanner(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initConsentBanner);
  } else {
    initConsentBanner();
  }
})();
