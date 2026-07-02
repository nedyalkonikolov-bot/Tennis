(function () {
  var banners = [
    {
      name: "Stake.com",
      href: "https://stake.com/?c=NOYIoKcY",
      image: "/ads/stake-banner-160x600.gif",
      position: "left",
    },
    {
      name: "Cloudbet",
      href: "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4",
      image: "/ads/cloudbet-offer-160x600.png",
      position: "right",
    },
  ];
  var topBanner = {
    name: "BC.Game",
    href: "https://bc.game/i-9767ib363b-n/",
    image: "/ads/bc-game-banner-970x250.gif",
  };

  function createRail(banner) {
    var rail = document.createElement("aside");
    rail.className = "side-banner-rail side-banner-rail-" + banner.position;
    rail.setAttribute("aria-label", banner.name + " sponsored offer");

    var link = document.createElement("a");
    link.className = "side-banner";
    link.href = banner.href;
    link.target = "_blank";
    link.rel = "nofollow sponsored noopener noreferrer";
    link.setAttribute("aria-label", "Open " + banner.name + " sponsored offer");
    link.addEventListener("click", function () {
      trackAffiliateClick(banner.name, "side_banner_" + banner.position);
    });

    var image = document.createElement("img");
    image.src = banner.image;
    image.alt = banner.name + " sponsored offer";
    image.width = 160;
    image.height = 600;
    image.loading = "lazy";

    link.appendChild(image);
    rail.appendChild(link);
    return rail;
  }

  function shouldShowTopBanner() {
    return !/\/social-poster\/?$/.test(window.location.pathname);
  }

  function createTopBanner() {
    var wrap = document.createElement("div");
    wrap.className = "top-sponsored-banner";
    wrap.setAttribute("aria-label", topBanner.name + " sponsored offer");

    var link = document.createElement("a");
    link.className = "top-sponsored-banner-link";
    link.href = topBanner.href;
    link.target = "_blank";
    link.rel = "nofollow sponsored noopener noreferrer";
    link.setAttribute("aria-label", "Open " + topBanner.name + " sponsored offer");
    link.addEventListener("click", function () {
      trackAffiliateClick(topBanner.name, "top_banner_static");
    });

    var image = document.createElement("img");
    image.src = topBanner.image;
    image.alt = topBanner.name + " sponsored crypto casino offer";
    image.width = 970;
    image.height = 250;
    image.loading = "lazy";

    link.appendChild(image);
    wrap.appendChild(link);
    return wrap;
  }

  function trackAffiliateClick(name, placement) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "affiliate_click",
      affiliate_brand: name,
      affiliate_placement: placement,
      page_path: window.location.pathname,
    });
    if (typeof window.gtag === "function") {
      window.gtag("event", "affiliate_click", {
        affiliate_brand: name,
        affiliate_placement: placement,
        page_path: window.location.pathname,
      });
    }
  }

  function install() {
    if (document.querySelector("[data-side-banners]")) return true;

    var content = document.getElementById("root") || document.querySelector("main");
    if (!content || !content.parentNode) return false;

    var shell = document.createElement("div");
    shell.className = "site-ad-shell";
    shell.setAttribute("data-side-banners", "");

    content.parentNode.insertBefore(shell, content);
    shell.appendChild(createRail(banners[0]));
    if (shouldShowTopBanner()) {
      var contentWrap = document.createElement("div");
      contentWrap.className = "site-ad-content";
      contentWrap.appendChild(createTopBanner());
      contentWrap.appendChild(content);
      shell.appendChild(contentWrap);
    } else {
      shell.appendChild(content);
    }
    shell.appendChild(createRail(banners[1]));
    return true;
  }

  if (!install()) {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
