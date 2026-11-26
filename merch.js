(() => {
  "use strict";

  // Public, read-only product catalog endpoint. Never put Printify or Stripe secrets here.
  const API_URL = "https://vodou-merch-api.kian-bowman25.workers.dev/products";

  const grid = document.getElementById("productGrid");
  const status = document.getElementById("shopStatus");
  const empty = document.getElementById("emptyState");
  const search = document.getElementById("productSearch");
  const category = document.getElementById("categoryFilter");
  const dialog = document.getElementById("productDialog");
  const dialogClose = document.getElementById("dialogClose");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogImage = document.getElementById("dialogImage");
  const dialogDescription = document.getElementById("dialogDescription");
  const variantControls = document.getElementById("variantControls");
  let products = [];

  const plainText = (html) => {
    const node = document.createElement("div");
    node.innerHTML = String(html || "");
    return (node.textContent || node.innerText || "").replace(/\s+/g, " ").trim();
  };

  const getImage = (product) => {
    const images = Array.isArray(product.images) ? product.images : [];
    const preferred = images.find(image => image && image.is_default && image.src) ||
                      images.find(image => image && image.position === "front" && image.src) ||
                      images.find(image => image && image.src);
    return preferred ? preferred.src : "";
  };

  const enabledVariants = (product) => (product.variants || []).filter(v =>
    v && v.is_enabled !== false && v.is_available !== false
  );

  const categoryFor = (product) => {
    const title = (product.title || "").toLowerCase();
    if (title.includes("hoodie") || title.includes("sweatshirt")) return "hoodie";
    if (title.includes("tee") || title.includes("t-shirt") || title.includes("shirt")) return "shirt";
    return "other";
  };

  const productDescription = (product) => plainText(product.description).slice(0, 220);

  function render() {
    const query = search.value.trim().toLowerCase();
    const selectedCategory = category.value;
    const visible = products.filter(product => {
      const matchesText = (product.title || "").toLowerCase().includes(query) ||
        productDescription(product).toLowerCase().includes(query);
      const matchesCategory = selectedCategory === "all" || categoryFor(product) === selectedCategory;
      return matchesText && matchesCategory;
    });

    grid.replaceChildren();
    empty.hidden = visible.length !== 0;

    visible.forEach(product => {
      const card = document.createElement("article");
      card.className = "product-card";

      const imageFrame = document.createElement("div");
      imageFrame.className = "product-image";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = product.title || "Vodou merchandise";
      img.src = getImage(product);
      imageFrame.appendChild(img);

      const info = document.createElement("div");
      info.className = "product-info";
      const type = document.createElement("p");
      type.className = "product-category";
      type.textContent = categoryFor(product) === "other" ? "Official merchandise" :
        categoryFor(product) === "hoodie" ? "Hoodie" : "T-shirt";
      const title = document.createElement("h3");
      title.textContent = product.title || "Vodou merchandise";
      const description = document.createElement("p");
      description.textContent = productDescription(product) || "Official Vodou merchandise.";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "product-button";
      button.textContent = "View details";
      button.addEventListener("click", () => openProduct(product));

      info.append(type, title, description, button);
      card.append(imageFrame, info);
      grid.appendChild(card);
    });

    status.textContent = `${visible.length} ${visible.length === 1 ? "item" : "items"} in the collection`;
  }

  function openProduct(product) {
    dialogTitle.textContent = product.title || "Vodou merchandise";
    dialogImage.src = getImage(product);
    dialogImage.alt = product.title || "Vodou merchandise";
    dialogDescription.textContent = productDescription(product) || "Official Vodou merchandise.";
    variantControls.replaceChildren();

    const variants = enabledVariants(product);
    const options = Array.isArray(product.options) ? product.options : [];

    if (options.length && variants.length) {
      options.forEach((option, index) => {
        const group = document.createElement("div");
        group.className = "variant-group";
        const label = document.createElement("label");
        const select = document.createElement("select");
        const id = `variant-${index}`;
        label.htmlFor = id;
        label.textContent = option.name || `Option ${index + 1}`;
        select.id = id;

        const values = Array.isArray(option.values) ? option.values : [];
        values.forEach(value => {
          const opt = document.createElement("option");
          opt.value = String(value.id ?? value);
          opt.textContent = String(value.title ?? value);
          select.appendChild(opt);
        });
        group.append(label, select);
        variantControls.appendChild(group);
      });
    } else if (variants.length) {
      const note = document.createElement("p");
      note.textContent = `${variants.length} available variant${variants.length === 1 ? "" : "s"}.`;
      variantControls.appendChild(note);
    } else {
      const note = document.createElement("p");
      note.textContent = "Variant availability is being checked.";
      variantControls.appendChild(note);
    }

    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  async function loadProducts() {
    try {
      const response = await fetch(API_URL, { headers: { "Accept": "application/json" } });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      const data = await response.json();
      products = Array.isArray(data) ? data :
        Array.isArray(data.products) ? data.products :
        Array.isArray(data.data) ? data.data : [];
      products = products.filter(product => product && product.visible !== false);
      if (!products.length) throw new Error("The catalog returned no visible products.");
      render();
    } catch (error) {
      console.error("Vodou merch catalog:", error);
      status.textContent = "The merch catalog could not load right now. Please try again shortly.";
      grid.replaceChildren();
    }
  }

  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.textContent = open ? "×" : "☰";
  });

  search.addEventListener("input", render);
  category.addEventListener("change", render);
  dialogClose.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  document.getElementById("year").textContent = new Date().getFullYear();

  loadProducts();
})();
