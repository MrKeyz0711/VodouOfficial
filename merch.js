(() => {
  "use strict";

  const API_BASE = "https://vodou-merch-api.kian-bowman25.workers.dev";
  const API_URL = `${API_BASE}/products`;
  const CART_STORAGE_KEY = "vodouMerchCartV1";

  const grid = document.getElementById("productGrid");
  const status = document.getElementById("shopStatus");
  const empty = document.getElementById("emptyState");
  const search = document.getElementById("productSearch");
  const category = document.getElementById("categoryFilter");
  const dialog = document.getElementById("productDialog");
  const dialogClose = document.getElementById("dialogClose");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogImage = document.getElementById("dialogImage");
  const dialogImageThumbnails = document.getElementById("dialogImageThumbnails");
  const dialogDescription = document.getElementById("dialogDescription");
  const variantControls = document.getElementById("variantControls");
  const selectedPrice = document.getElementById("selectedPrice");
  const quantityInput = document.getElementById("productQuantity");
  const addToCartButton = document.getElementById("addToCartButton");
  const cartOpenButton = document.getElementById("cartOpenButton");
  const cartCount = document.getElementById("cartCount");
  const cartDialog = document.getElementById("cartDialog");
  const cartClose = document.getElementById("cartClose");
  const cartItemsElement = document.getElementById("cartItems");
  const cartSubtotalElement = document.getElementById("cartSubtotal");

  // Checkout elements.
  const checkoutButton = document.getElementById("checkoutButton");
  const checkoutDialog = document.getElementById("checkoutDialog");
  const checkoutClose = document.getElementById("checkoutClose");
  const shippingAddressForm = document.getElementById("shippingAddressForm");
  const shippingRatesSection = document.getElementById("shippingRatesSection");
  const shippingRatesStatus = document.getElementById("shippingRatesStatus");
  const shippingOptions = document.getElementById("shippingOptions");
  const payButton = document.getElementById("payButton");
  const changeAddressButton = document.getElementById("changeAddressButton");

  let products = [];
  const cardGalleryTimers = [];
  const selectedCardColors = new Map();
  let activeProduct = null;
  let activeVariant = null;
  let activeGalleryPosition = "front";
  let cart = loadCart();
  let availableShippingOptions = [];
  let selectedShippingOption = null;
  let lastShippingAddress = null;
  let shippingRequestInProgress = false;
  let checkoutRequestInProgress = false;

  const money = cents => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format((Number(cents) || 0) / 100);

  const plainText = html => {
    const node = document.createElement("div");
    node.innerHTML = String(html || "");
    return (node.textContent || node.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const getGalleryImages = (product, variantId = null) => {
    const images = Array.isArray(product.images) ? product.images : [];

    const relevant = images.filter(image => {
      if (!image || !image.src) return false;

      const position = String(image.position || "").toLowerCase();

      if (position !== "front" && position !== "back") {
        return false;
      }

      if (
        variantId != null &&
        Array.isArray(image.variant_ids) &&
        image.variant_ids.length &&
        !image.variant_ids.map(String).includes(String(variantId))
      ) {
        return false;
      }

      return true;
    });

    const unique = [];
    const seen = new Set();

    relevant.forEach(image => {
      if (seen.has(image.src)) return;
      seen.add(image.src);

      unique.push({
        src: image.src,
        position: String(image.position).toLowerCase()
      });
    });

    return ["front", "back"]
      .map(position => unique.find(image => image.position === position))
      .filter(Boolean);
  };

  const getImage = (product, variantId = null) => {
    const gallery = getGalleryImages(product, variantId);
    const front = gallery.find(image => image.position === "front");

    return front?.src || gallery[0]?.src || "";
  };

  const enabledVariants = product =>
    (Array.isArray(product.variants) ? product.variants : [])
      .filter(v =>
        v &&
        v.is_enabled !== false &&
        v.is_available !== false &&
        Number.isFinite(Number(v.price)) &&
        Number(v.price) >= 0
      );

  const getColorOption = product =>
    (Array.isArray(product.options) ? product.options : [])
      .find(option => String(option.type || "").toLowerCase() === "color") || null;

  const getColorValueId = (product, variant) => {
    const colorOption = getColorOption(product);
    if (!colorOption || !Array.isArray(variant?.options)) return null;

    const colorValueIds = new Set(
      (Array.isArray(colorOption.values) ? colorOption.values : [])
        .map(value => String(value.id))
    );

    return variant.options.map(String).find(id => colorValueIds.has(id)) || null;
  };

  const getAvailableColors = product => {
    const colorOption = getColorOption(product);
    if (!colorOption) return [];

    const variants = enabledVariants(product);
    const availableIds = new Set(
      variants.map(variant => getColorValueId(product, variant)).filter(Boolean)
    );

    return (Array.isArray(colorOption.values) ? colorOption.values : [])
      .filter(value => availableIds.has(String(value.id)));
  };

  const getVariantForColor = (product, colorId) => {
    if (colorId == null) return enabledVariants(product)[0] || null;
    return enabledVariants(product).find(variant =>
      String(getColorValueId(product, variant)) === String(colorId)
    ) || null;
  };

  const colorSwatchValue = name => {
    const value = String(name || "").trim().toLowerCase();
    const known = {
      "white": "#ffffff", "black": "#111111", "heather black": "#343434",
      "charcoal": "#454545", "gray": "#888888", "grey": "#888888",
      "ash": "#c9c9c9", "silver": "#c0c0c0", "navy": "#18294a",
      "blue": "#2865a8", "royal": "#2455bd", "red": "#b5232e",
      "maroon": "#641d32", "burgundy": "#641d32", "green": "#356b48",
      "forest": "#234d37", "olive": "#77733b", "yellow": "#e4c542",
      "gold": "#c49a36", "orange": "#d8792c", "pink": "#df91aa",
      "purple": "#76518f", "lavender": "#b7a2d1", "brown": "#76543b",
      "natural": "#d8c6a4", "cream": "#eee4cf", "sand": "#c9b99a"
    };
    if (known[value]) return known[value];
    const matchingColor = Object.keys(known).find(key => value.includes(key));
    if (matchingColor) return known[matchingColor];
    return typeof CSS !== "undefined" && CSS.supports("color", value)
      ? value
      : "#999999";
  };

  const categoryFor = product => {
    const title = (product.title || "").toLowerCase();

    if (title.includes("hoodie") || title.includes("sweatshirt")) {
      return "hoodie";
    }

    if (
      title.includes("tee") ||
      title.includes("t-shirt") ||
      title.includes("shirt")
    ) {
      return "shirt";
    }

    return "other";
  };

  const productDescription = product =>
    plainText(product.description).slice(0, 220);

  function loadCart() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(CART_STORAGE_KEY) || "[]"
      );

      return Array.isArray(saved)
        ? saved.filter(item =>
            item &&
            typeof item.productId === "string" &&
            Number.isFinite(Number(item.variantId)) &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0
          )
        : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
      );
    } catch (error) {
      console.warn("Could not save Vodou cart:", error);
    }

    renderCart();
  }

  function render() {
    cardGalleryTimers.forEach(timer => window.clearInterval(timer));
    cardGalleryTimers.length = 0;

    const query = search.value.trim().toLowerCase();
    const selectedCategory = category.value;

    const visible = products.filter(product => {
      const matchesText =
        (product.title || "").toLowerCase().includes(query) ||
        productDescription(product).toLowerCase().includes(query);

      const matchesCategory =
        selectedCategory === "all" ||
        categoryFor(product) === selectedCategory;

      return matchesText && matchesCategory;
    });

    grid.replaceChildren();
    empty.hidden = visible.length !== 0;

    visible.forEach(product => {
      const card = document.createElement("article");
      card.className = "product-card";

      const variants = enabledVariants(product);
      const colors = getAvailableColors(product);
      const rememberedColor = selectedCardColors.get(String(product.id));
      const initialColor = colors.some(color => String(color.id) === String(rememberedColor))
        ? String(rememberedColor)
        : colors[0] ? String(colors[0].id) : null;
      if (initialColor != null) selectedCardColors.set(String(product.id), initialColor);

      let previewVariant = getVariantForColor(product, initialColor);
      let gallery = getGalleryImages(product, previewVariant?.id);
      if (!gallery.length) gallery = getGalleryImages(product);
      let imageIndex = Math.max(0, gallery.findIndex(image => image.position === "front"));
      let autoPaused = false;

      const imageFrame = document.createElement("div");
      imageFrame.className = "product-image product-gallery-frame";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = `${product.title || "Vodou merchandise"} - front`;
      img.src = gallery[imageIndex]?.src || getImage(product, previewVariant?.id);
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", `View ${product.title || "product"} details`);
      img.addEventListener("click", () => openProduct(product, selectedCardColors.get(String(product.id)) || null));
      img.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProduct(product, selectedCardColors.get(String(product.id)) || null);
        }
      });
      imageFrame.appendChild(img);

      const updateCardImage = () => {
        if (!gallery.length) return;
        const image = gallery[imageIndex];
        img.src = image.src;
        img.alt = `${product.title || "Vodou merchandise"} - ${image.position}`;
      };

      const changeCardImage = direction => {
        if (gallery.length < 2) return;
        imageIndex = (imageIndex + direction + gallery.length) % gallery.length;
        updateCardImage();
      };

      if (gallery.length > 1) {
        const previous = document.createElement("button");
        previous.type = "button";
        previous.className = "product-gallery-arrow product-gallery-previous";
        previous.textContent = "‹";
        previous.setAttribute("aria-label", "Show previous product image");
        previous.addEventListener("click", event => {
          event.stopPropagation();
          autoPaused = true;
          changeCardImage(-1);
        });

        const next = document.createElement("button");
        next.type = "button";
        next.className = "product-gallery-arrow product-gallery-next";
        next.textContent = "›";
        next.setAttribute("aria-label", "Show next product image");
        next.addEventListener("click", event => {
          event.stopPropagation();
          autoPaused = true;
          changeCardImage(1);
        });

        imageFrame.append(previous, next);
        imageFrame.addEventListener("mouseenter", () => { autoPaused = true; });
        imageFrame.addEventListener("mouseleave", () => { autoPaused = false; });

        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const timer = window.setInterval(() => {
            if (!autoPaused && !document.hidden) changeCardImage(1);
          }, 4000);
          cardGalleryTimers.push(timer);
        }
      }

      const swatches = document.createElement("div");
      swatches.className = "product-color-swatches";
      if (colors.length) {
        const colorLabel = document.createElement("span");
        colorLabel.className = "product-color-label";
        colorLabel.textContent = "Color:";
        swatches.appendChild(colorLabel);

        colors.forEach(color => {
          const swatch = document.createElement("button");
          const colorName = String(color.title ?? color.name ?? "Color");
          const isSelected = String(color.id) === String(initialColor);
          swatch.type = "button";
          swatch.className = "product-color-swatch";
          swatch.style.setProperty("--swatch-color", colorSwatchValue(colorName));
          swatch.title = colorName;
          swatch.setAttribute("aria-label", `Choose ${colorName}`);
          swatch.setAttribute("aria-pressed", String(isSelected));
          if (isSelected) swatch.classList.add("selected");

          swatch.addEventListener("click", () => {
            const colorId = String(color.id);
            selectedCardColors.set(String(product.id), colorId);
            swatches.querySelectorAll(".product-color-swatch").forEach(button => {
              const selected = button === swatch;
              button.classList.toggle("selected", selected);
              button.setAttribute("aria-pressed", String(selected));
            });

            previewVariant = getVariantForColor(product, colorId);
            gallery = getGalleryImages(product, previewVariant?.id);
            if (!gallery.length) gallery = getGalleryImages(product);
            imageIndex = Math.max(0, gallery.findIndex(image => image.position === "front"));
            updateCardImage();

            const colorVariants = variants.filter(variant =>
              String(getColorValueId(product, variant)) === colorId
            );
            if (colorVariants.length) {
              const lowest = Math.min(...colorVariants.map(variant => Number(variant.price)));
              const highest = Math.max(...colorVariants.map(variant => Number(variant.price)));
              price.textContent = lowest === highest
                ? money(lowest)
                : `From ${money(lowest)}`;
            }
          });

          swatches.appendChild(swatch);
        });
      }

      const info = document.createElement("div");
      info.className = "product-info";

      const type = document.createElement("p");
      type.className = "product-category";
      type.textContent =
        categoryFor(product) === "other"
          ? "Official merchandise"
          : categoryFor(product) === "hoodie"
            ? "Hoodie"
            : "T-shirt";

      const title = document.createElement("h3");
      title.textContent = product.title || "Vodou merchandise";

      const description = document.createElement("p");
      description.textContent =
        productDescription(product) || "Official Vodou merchandise.";

      const price = document.createElement("p");
      price.className = "product-price";

      if (variants.length) {
        const relevantVariants = initialColor == null
          ? variants
          : variants.filter(variant => String(getColorValueId(product, variant)) === String(initialColor));
        const priceVariants = relevantVariants.length ? relevantVariants : variants;
        const lowest = Math.min(...priceVariants.map(v => Number(v.price)));
        const highest = Math.max(...priceVariants.map(v => Number(v.price)));

        price.textContent =
          lowest === highest
            ? money(lowest)
            : `From ${money(lowest)}`;
      } else {
        price.textContent = "Price unavailable";
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "product-button";
      button.textContent = "Choose options";
      button.disabled = variants.length === 0;
      button.addEventListener("click", () => {
        openProduct(product, selectedCardColors.get(String(product.id)) || null);
      });

      info.append(type, title, description, price, button);
      card.append(imageFrame);
      if (colors.length) card.appendChild(swatches);
      card.appendChild(info);
      grid.appendChild(card);
    });

    status.textContent =
      `${visible.length} ${visible.length === 1 ? "item" : "items"} in the collection`;
  }

  function findSelectedVariant(product) {
    const variants = enabledVariants(product);

    const selects = Array.from(
      variantControls.querySelectorAll("select[data-option-index]")
    );

    if (!selects.length) {
      const singleSelect = variantControls.querySelector(
        "select[data-single-variant]"
      );

      if (singleSelect) {
        return variants.find(
          v => String(v.id) === singleSelect.value
        ) || null;
      }

      return variants.find(v => v.is_default) || variants[0] || null;
    }

    const options = product.options || [];
    const selected = {};

    selects.forEach(select => {
      const index = Number(select.dataset.optionIndex);
      const option = options[index];

      if (!option) return;

      selected[option.type] = Number(select.value);
    });

    return variants.find(variant => {
      const variantIds = variant.options.map(Number);

      const colorOption = options.find(o => o.type === "color");
      const sizeOption = options.find(o => o.type === "size");

      const colorId = colorOption?.values
        .map(v => Number(v.id))
        .find(id => variantIds.includes(id));

      const sizeId = sizeOption?.values
        .map(v => Number(v.id))
        .find(id => variantIds.includes(id));

      return (
        selected.color === colorId &&
        selected.size === sizeId
      );
    }) || null;
  }

  function renderGallery(product, variantId = null) {
    let gallery = getGalleryImages(product, variantId);

    if (gallery.length < 2) {
      gallery = getGalleryImages(product);
    }

    dialogImageThumbnails.replaceChildren();

    if (!gallery.length) {
      dialogImage.removeAttribute("src");
      return;
    }

    if (!gallery.some(image => image.position === activeGalleryPosition)) {
      activeGalleryPosition = gallery.some(image => image.position === "front")
        ? "front"
        : gallery[0].position;
    }

    const selectedImage = gallery.find(
      image => image.position === activeGalleryPosition
    ) || gallery[0];

    dialogImage.src = selectedImage.src;
    dialogImage.alt =
      `${product.title || "Vodou merchandise"} - ${selectedImage.position}`;

    gallery.forEach(image => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-thumb";

      if (image.position === activeGalleryPosition) {
        button.classList.add("active");
      }

      button.textContent =
        image.position.charAt(0).toUpperCase() +
        image.position.slice(1);

      button.setAttribute(
        "aria-pressed",
        String(image.position === activeGalleryPosition)
      );

      button.addEventListener("click", () => {
        activeGalleryPosition = image.position;
        dialogImage.src = image.src;
        dialogImage.alt =
          `${product.title || "Vodou merchandise"} - ${image.position}`;

        dialogImageThumbnails
          .querySelectorAll(".gallery-thumb")
          .forEach(thumb => {
            const isActive =
              thumb.textContent.toLowerCase() === image.position;

            thumb.classList.toggle("active", isActive);
            thumb.setAttribute("aria-pressed", String(isActive));
          });
      });

      dialogImageThumbnails.appendChild(button);
    });
  }

  function updateSelectedVariant() {
    if (!activeProduct) return;

    activeVariant = findSelectedVariant(activeProduct);

    if (activeVariant) {
      selectedPrice.textContent = money(activeVariant.price);
      addToCartButton.disabled = false;
      renderGallery(activeProduct, activeVariant.id);
    } else {
      selectedPrice.textContent = "That combination is unavailable.";
      addToCartButton.disabled = true;
    }
  }

  function openProduct(product, preferredColorId = null) {
    activeProduct = product;
    activeVariant = null;
    activeGalleryPosition = "front";

    dialogTitle.textContent = product.title || "Vodou merchandise";
    renderGallery(product);

    dialogDescription.textContent =
      productDescription(product) || "Official Vodou merchandise.";

    variantControls.replaceChildren();
    quantityInput.value = "1";

    const variants = enabledVariants(product);
    const options = Array.isArray(product.options) ? product.options : [];

    if (
      options.length &&
      variants.length &&
      variants.every(v => Array.isArray(v.options))
    ) {
      options.forEach((option, index) => {
        const group = document.createElement("div");
        group.className = "variant-group";

        const label = document.createElement("label");
        const select = document.createElement("select");
        const id = `variant-option-${index}`;

        label.htmlFor = id;
        label.textContent = option.name || `Option ${index + 1}`;

        select.id = id;
        select.dataset.optionIndex = String(index);

        const optionValueIds = new Set(
          (Array.isArray(option.values) ? option.values : [])
            .map(value => Number(value.id))
        );

        const availableIds = new Set(
          variants.flatMap(variant =>
            variant.options
              .map(Number)
              .filter(valueId => optionValueIds.has(valueId))
          )
        );

        const values = Array.isArray(option.values) ? option.values : [];

        values
          .filter(value => availableIds.has(Number(value.id)))
          .forEach(value => {
            const opt = document.createElement("option");
            opt.value = String(value.id);
            opt.textContent = String(value.title ?? value.id);
            select.appendChild(opt);
          });

        select.addEventListener("change", updateSelectedVariant);

        group.append(label, select);
        variantControls.appendChild(group);
      });

      const defaultVariant =
        variants.find(v => v.is_default) || variants[0];

      if (defaultVariant) {
        const selects = Array.from(
          variantControls.querySelectorAll("select[data-option-index]")
        );

        selects.forEach((select, index) => {
          const option = options[index];

          const optionValueIds = new Set(
            (Array.isArray(option.values) ? option.values : [])
              .map(value => Number(value.id))
          );

          const matchingId = defaultVariant.options
            .map(Number)
            .find(valueId => optionValueIds.has(valueId));

          if (matchingId !== undefined) {
            select.value = String(matchingId);
          }
        });

        if (preferredColorId != null) {
          const colorOptionIndex = options.findIndex(
            option => String(option.type || "").toLowerCase() === "color"
          );
          const colorVariant = getVariantForColor(product, preferredColorId);

          if (colorOptionIndex >= 0 && colorVariant) {
            selects.forEach((select, index) => {
              const option = options[index];
              const optionValueIds = new Set(
                (Array.isArray(option.values) ? option.values : [])
                  .map(value => Number(value.id))
              );
              const matchingId = colorVariant.options
                .map(Number)
                .find(valueId => optionValueIds.has(valueId));
              if (matchingId !== undefined) select.value = String(matchingId);
            });
          }
        }
      }
    } else if (variants.length) {
      const group = document.createElement("div");
      group.className = "variant-group";

      const label = document.createElement("label");
      label.htmlFor = "singleVariantSelect";
      label.textContent = "Available option";

      const select = document.createElement("select");
      select.id = "singleVariantSelect";
      select.dataset.singleVariant = "true";

      variants.forEach(variant => {
        const option = document.createElement("option");
        option.value = String(variant.id);
        option.textContent = variant.title || `Variant ${variant.id}`;
        select.appendChild(option);
      });

      select.addEventListener("change", updateSelectedVariant);

      group.append(label, select);
      variantControls.appendChild(group);

      activeVariant =
        variants.find(v => v.is_default) || variants[0];

      select.value = String(activeVariant.id);
    } else {
      const note = document.createElement("p");
      note.textContent =
        "No available variants are currently listed for this item.";

      variantControls.appendChild(note);
      addToCartButton.disabled = true;
    }

    updateSelectedVariant();

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }

  function addActiveToCart() {
    if (!activeProduct || !activeVariant) return;

    const quantity = Math.max(
      1,
      Math.min(20, Number.parseInt(quantityInput.value, 10) || 1)
    );

    const productId = String(activeProduct.id);
    const variantId = Number(activeVariant.id);
    const key = `${productId}:${variantId}`;

    const existing = cart.find(item => item.key === key);

    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + quantity);
    } else {
      cart.push({
        key,
        productId,
        variantId,
        title: activeProduct.title || "Vodou merchandise",
        variantTitle: activeVariant.title || "",
        image:
          getImage(activeProduct, activeVariant.id) ||
          getImage(activeProduct),
        price: Number(activeVariant.price),
        quantity
      });
    }

    saveCart();
    resetShippingRates();
    dialog.close();

    if (typeof cartDialog.showModal === "function") {
      cartDialog.showModal();
    }
  }

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    cartCount.textContent = String(count);
    cartItemsElement.replaceChildren();

    if (!cart.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "cart-empty";
      emptyMessage.textContent =
        "Your cart is empty. Find something you like in the collection.";

      cartItemsElement.appendChild(emptyMessage);
    }

    cart.forEach(item => {
      const row = document.createElement("article");
      row.className = "cart-item";

      const img = document.createElement("img");
      img.src = item.image || "";
      img.alt = "";

      const details = document.createElement("div");

      const title = document.createElement("p");
      title.className = "cart-item-title";
      title.textContent = item.title;

      const meta = document.createElement("p");
      meta.className = "cart-item-meta";
      meta.textContent = item.variantTitle;

      const unit = document.createElement("p");
      unit.className = "cart-item-price";
      unit.textContent = `${money(item.price)} each`;

      const controls = document.createElement("div");
      controls.className = "cart-item-controls";

      const decrease = document.createElement("button");
      decrease.type = "button";
      decrease.textContent = "−";
      decrease.setAttribute("aria-label", `Decrease quantity of ${item.title}`);
      decrease.addEventListener("click", () => changeQuantity(item.key, -1));

      const quantity = document.createElement("span");
      quantity.textContent = String(item.quantity);

      const increase = document.createElement("button");
      increase.type = "button";
      increase.textContent = "+";
      increase.setAttribute("aria-label", `Increase quantity of ${item.title}`);
      increase.addEventListener("click", () => changeQuantity(item.key, 1));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-cart-item";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removeCartItem(item.key));

      controls.append(decrease, quantity, increase, remove);
      details.append(title, meta, unit, controls);

      const lineTotal = document.createElement("strong");
      lineTotal.className = "cart-line-total";
      lineTotal.textContent = money(item.price * item.quantity);

      row.append(img, details, lineTotal);
      cartItemsElement.appendChild(row);
    });

    const subtotal = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    cartSubtotalElement.textContent = money(subtotal);
  }

  function changeQuantity(key, amount) {
    const item = cart.find(entry => entry.key === key);
    if (!item) return;

    item.quantity += amount;

    if (item.quantity <= 0) {
      cart = cart.filter(entry => entry.key !== key);
    } else {
      item.quantity = Math.min(99, item.quantity);
    }

    saveCart();
    resetShippingRates();
  }

  function removeCartItem(key) {
    cart = cart.filter(item => item.key !== key);
    saveCart();
    resetShippingRates();
  }

  function resetShippingRates() {
    availableShippingOptions = [];
    selectedShippingOption = null;
    lastShippingAddress = null;

    if (shippingOptions) {
      shippingOptions.replaceChildren();
    }

    if (shippingRatesSection) {
      shippingRatesSection.hidden = true;
    }

    if (payButton) {
      payButton.disabled = true;
    }
  }

  function getShippingAddress() {
    const fullName = document
      .getElementById("shippingName")
      .value.trim();

    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || "";
    const lastName = nameParts.join(" ");

    return {
      first_name: firstName,
      last_name: lastName,
      email: document.getElementById("shippingEmail").value.trim(),
      address1: document.getElementById("shippingAddress1").value.trim(),
      address2: document.getElementById("shippingAddress2").value.trim(),
      city: document.getElementById("shippingCity").value.trim(),
      region: document.getElementById("shippingState").value.trim().toUpperCase(),
      zip: document.getElementById("shippingZip").value.trim(),
      country: "US"
    };
  }

  function showShippingMessage(message, isError = false) {
    if (!shippingRatesStatus) return;

    shippingRatesStatus.textContent = message;
    shippingRatesStatus.setAttribute("role", isError ? "alert" : "status");
  }

  function renderShippingOptions(options) {
    shippingOptions.replaceChildren();

    options.forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "shipping-option";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "shippingMethod";
      radio.value = option.id;

      const details = document.createElement("span");
      details.className = "shipping-option-details";

      const method = document.createElement("strong");
      method.textContent = option.label;

      const price = document.createElement("span");
      price.textContent = money(option.price);

      details.append(method, price);
      label.append(radio, details);

      radio.addEventListener("change", () => {
        selectedShippingOption = option;

        shippingOptions
          .querySelectorAll(".shipping-option")
          .forEach(element => element.classList.remove("selected"));

        label.classList.add("selected");

        if (payButton) {
          payButton.disabled = false;
        }
      });

      shippingOptions.appendChild(label);

      if (index === 0) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }
    });
  }

  async function calculateShipping(event) {
    event.preventDefault();

    if (shippingRequestInProgress) return;

    if (!cart.length) {
      showShippingMessage("Your cart is empty. Add an item before checkout.", true);
      return;
    }

    const address = getShippingAddress();

    if (!address.first_name || !address.last_name) {
      showShippingMessage("Please enter your first and last name.", true);
      return;
    }

    resetShippingRates();
    shippingRequestInProgress = true;

    const submitButton = document.getElementById("getShippingRatesButton");
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Calculating shipping...";

    showShippingMessage("Checking available shipping methods...");

    try {
      const response = await fetch(`${API_BASE}/shipping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          address,
          items: cart.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity
          }))
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `Shipping request failed (${response.status}).`
        );
      }

      if (!Array.isArray(result.options) || !result.options.length) {
        throw new Error("No shipping methods are available for this order.");
      }

      availableShippingOptions = result.options;
      lastShippingAddress = address;

      renderShippingOptions(availableShippingOptions);
      shippingRatesSection.hidden = false;

      showShippingMessage("Choose your shipping method, then continue to payment.");

    } catch (error) {
      console.error("Vodou shipping calculation:", error);

      showShippingMessage(
        error.message || "We couldn't calculate shipping. Please try again.",
        true
      );

    } finally {
      shippingRequestInProgress = false;
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }

  // Create a Stripe Checkout session using the secure Worker endpoint.
  async function startStripeCheckout(event) {
    if (event) event.preventDefault();

    if (checkoutRequestInProgress) return;

    if (!cart.length) {
      showShippingMessage("Your cart is empty.", true);
      return;
    }

    if (!selectedShippingOption || !lastShippingAddress) {
      showShippingMessage(
        "Please calculate shipping and select a shipping method first.",
        true
      );
      return;
    }

    checkoutRequestInProgress = true;

    const originalButtonText = payButton.textContent;
    payButton.disabled = true;
    payButton.textContent = "Connecting to Stripe...";

    showShippingMessage("Securely preparing your checkout...");

    try {
      const response = await fetch(
        `${API_BASE}/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            address: lastShippingAddress,
            shippingOptionId: selectedShippingOption.id,
            items: cart.map(item => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity
            }))
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `Checkout request failed (${response.status}).`
        );
      }

      if (!result.url || !result.url.startsWith("https://checkout.stripe.com/")) {
        throw new Error("Stripe did not return a valid checkout link.");
      }

      showShippingMessage("Opening secure Stripe Checkout...");

      window.location.assign(result.url);

    } catch (error) {
      console.error("Vodou Stripe checkout:", error);

      showShippingMessage(
        error.message || "Unable to start checkout. Please try again.",
        true
      );

      checkoutRequestInProgress = false;
      payButton.disabled = false;
      payButton.textContent = originalButtonText;
    }
  }

  async function loadProducts() {
    try {
      const response = await fetch(API_URL, {
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Catalog request failed (${response.status})`);
      }

      const data = await response.json();

      products = Array.isArray(data)
        ? data
        : Array.isArray(data.products)
          ? data.products
          : Array.isArray(data.data)
            ? data.data
            : [];

      products = products.filter(
        product => product && product.visible !== false
      );

      if (!products.length) {
        throw new Error("The catalog returned no visible products.");
      }

      render();

    } catch (error) {
      console.error("Vodou merch catalog:", error);

      status.textContent =
        "The merch catalog could not load right now. Please try again shortly.";

      grid.replaceChildren();
    }
  }

  // Styling for card galleries and color swatches is injected here so this update only requires merch.js.
  const merchInteractionStyles = document.createElement("style");
  merchInteractionStyles.textContent = `
    .product-image.product-gallery-frame { position: relative; overflow: hidden; }
    .product-image.product-gallery-frame img { cursor: zoom-in; }
    .product-gallery-arrow {
      position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
      width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.55);
      border-radius: 50%; background: rgba(0,0,0,.58); color: #fff;
      font: 30px/1 Arial, sans-serif; display: grid; place-items: center;
      cursor: pointer; padding: 0; transition: background .18s ease, opacity .18s ease;
    }
    .product-gallery-arrow:hover, .product-gallery-arrow:focus-visible { background: rgba(0,0,0,.86); }
    .product-gallery-previous { left: 12px; }
    .product-gallery-next { right: 12px; }
    .product-color-swatches {
      display: flex; align-items: center; flex-wrap: wrap; gap: 9px;
      padding: 12px 16px 0;
    }
    .product-color-label { font-size: .82rem; opacity: .78; margin-right: 2px; }
    .product-color-swatch {
      width: 23px; height: 23px; padding: 0; border-radius: 50%;
      border: 2px solid rgba(120,120,120,.48); background: var(--swatch-color, #999);
      cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
    }
    .product-color-swatch.selected { outline: 2px solid currentColor; outline-offset: 3px; }
    .product-color-swatch:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
    @media (max-width: 600px) {
      .product-gallery-arrow { width: 34px; height: 34px; }
      .product-color-swatches { padding-left: 12px; padding-right: 12px; }
    }
  `;
  document.head.appendChild(merchInteractionStyles);

  // Mobile navigation.
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");

    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.textContent = open ? "×" : "☰";
  });

  // Search and category filtering.
  search.addEventListener("input", render);
  category.addEventListener("change", render);

  // Product dialog.
  dialogClose.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  // Cart dialog.
  cartOpenButton.addEventListener("click", () => cartDialog.showModal());
  cartClose.addEventListener("click", () => cartDialog.close());

  cartDialog.addEventListener("click", event => {
    if (event.target === cartDialog) cartDialog.close();
  });

  addToCartButton.addEventListener("click", addActiveToCart);

  // Checkout dialog.
  if (checkoutButton && checkoutDialog) {
    checkoutButton.addEventListener("click", () => {
      if (!cart.length) {
        showShippingMessage("Your cart is empty. Add an item before checkout.", true);
        return;
      }

      resetShippingRates();
      cartDialog.close();
      checkoutDialog.showModal();
    });
  }

  if (checkoutClose && checkoutDialog) {
    checkoutClose.addEventListener("click", () => {
      checkoutDialog.close();
    });
  }

  if (checkoutDialog) {
    checkoutDialog.addEventListener("click", event => {
      if (event.target === checkoutDialog) {
        checkoutDialog.close();
      }
    });
  }

  if (shippingAddressForm) {
    shippingAddressForm.addEventListener("submit", calculateShipping);

    // If the customer edits their address, require fresh shipping rates.
    shippingAddressForm.addEventListener("input", () => {
      if (lastShippingAddress) {
        resetShippingRates();
        showShippingMessage("Your address changed. Calculate shipping again.");
      }
    });
  }

  if (changeAddressButton) {
    changeAddressButton.addEventListener("click", () => {
      resetShippingRates();
      showShippingMessage("Update your address and calculate shipping again.");
    });
  }

  if (payButton) {
    payButton.disabled = true;
    payButton.addEventListener("click", startStripeCheckout);
  }

  // Explain when a customer returns from Stripe without completing checkout.
  const checkoutParams = new URLSearchParams(window.location.search);

  if (checkoutParams.get("checkout") === "cancelled") {
    status.textContent =
      "Checkout was canceled. Your cart is saved, and you can continue shopping whenever you're ready.";

    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Footer year.
  const yearElement = document.getElementById("year");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  renderCart();
  loadProducts();
})();
