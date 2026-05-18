(function () {
  if (document.querySelector("[data-side-banners]")) return;

  var banners = [
    {
      name: "Stake.com",
      label: "Stake offer",
      href: "https://stake.com/?c=NOYIoKcY",
      image: "/ads/stake-banner-160x600.gif",
      position: "left",
    },
    {
      name: "Cloudbet",
      label: "Cloudbet bonus",
      href: "https://cldbt.cloud/go/en/landing/bitcoin-betting?af_token=ecea0a0896472c99ee3ff23d7fae8483&aftm_campaign=Tennis&aftm_source=tennistipz.win&aftm_medium=organic&aftm_content=Predictions&aftm_cid=4",
      image: "/ads/cloudbet-offer-160x600.png",
      position: "right",
    },
  ];

  var wrapper = document.createElement("aside");
  wrapper.className = "side-banners";
  wrapper.setAttribute("data-side-banners", "");
  wrapper.setAttribute("aria-label", "Sponsored betting offers");

  banners.forEach(function (banner) {
    var link = document.createElement("a");
    link.className = "side-banner side-banner-" + banner.position;
    link.href = banner.href;
    link.target = "_blank";
    link.rel = "nofollow sponsored noopener noreferrer";
    link.setAttribute("aria-label", "Open " + banner.name + " sponsored offer");

    var label = document.createElement("span");
    label.className = "side-banner-label";
    label.textContent = banner.label;

    var image = document.createElement("img");
    image.src = banner.image;
    image.alt = banner.name + " sponsored offer";
    image.width = 160;
    image.height = 600;
    image.loading = "lazy";

    var note = document.createElement("span");
    note.className = "side-banner-note";
    note.textContent = "18+ Bet responsibly";

    link.appendChild(label);
    link.appendChild(image);
    link.appendChild(note);
    wrapper.appendChild(link);
  });

  document.body.appendChild(wrapper);
})();
