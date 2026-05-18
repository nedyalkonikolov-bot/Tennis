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

  function install() {
    if (document.querySelector("[data-side-banners]")) return true;

    var content = document.getElementById("root") || document.querySelector("main");
    if (!content || !content.parentNode) return false;

    var shell = document.createElement("div");
    shell.className = "site-ad-shell";
    shell.setAttribute("data-side-banners", "");

    content.parentNode.insertBefore(shell, content);
    shell.appendChild(createRail(banners[0]));
    shell.appendChild(content);
    shell.appendChild(createRail(banners[1]));
    return true;
  }

  if (!install()) {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
