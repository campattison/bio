(function () {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const prev = document.getElementById("prevSlide");
  const next = document.getElementById("nextSlide");
  const dots = document.getElementById("dots");
  const count = document.getElementById("slideCount");
  const progress = document.getElementById("progressBar");
  const notes = document.getElementById("speakerNotes");
  const notesTitle = document.getElementById("notesTitle");
  const notesBody = document.getElementById("notesBody");

  let index = readHash();
  let lastRenderedIndex = null;
  let touchStartX = null;

  const allModals = Array.from(document.querySelectorAll(".matrix-modal"));
  let activeModal = null;
  let modalOpener = null;

  function openModal(modal, opener) {
    if (!modal) return;
    if (activeModal && activeModal !== modal) closeModal();
    activeModal = modal;
    modalOpener = opener || null;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("matrix-open");
    const closeBtn = modal.querySelector(".matrix-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!activeModal) return;
    activeModal.hidden = true;
    activeModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("matrix-open");
    if (modalOpener && typeof modalOpener.focus === "function") modalOpener.focus();
    activeModal = null;
    modalOpener = null;
  }

  function isMatrixOpen() {
    return activeModal !== null;
  }

  document.querySelectorAll("[data-open-modal], [data-open-matrix]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const targetId = btn.dataset.openModal || "matrixModal";
      openModal(document.getElementById(targetId), btn);
    });
  });

  allModals.forEach((modal) => {
    modal.querySelectorAll("[data-close-matrix]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        closeModal();
      });
    });
  });

  slides.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "dot";
    dots.appendChild(dot);
  });

  function readHash() {
    const raw = window.location.hash.replace("#", "");
    const slideNumber = Number(raw.replace("slide-", ""));
    if (Number.isFinite(slideNumber) && slideNumber > 0 && slideNumber <= slides.length) {
      return slideNumber - 1;
    }
    return 0;
  }

  function render() {
    slides.forEach((slide, i) => {
      slide.classList.toggle("current", i === index);
      slide.setAttribute("aria-hidden", i === index ? "false" : "true");
    });

    Array.from(dots.children).forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
    });

    prev.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    count.textContent = `${index + 1} / ${slides.length}`;
    progress.style.width = `${((index + 1) / slides.length) * 100}%`;

    const current = slides[index];
    if (index !== lastRenderedIndex) {
      window.scrollTo(0, 0);
      lastRenderedIndex = index;
    }

    notesTitle.textContent = current.dataset.title || "";
    notesBody.textContent = current.dataset.notes || "";
    notes.setAttribute("aria-hidden", document.body.classList.contains("show-notes") ? "false" : "true");

    const nextHash = `slide-${index + 1}`;
    if (window.location.hash !== `#${nextHash}`) {
      history.replaceState(null, "", `#${nextHash}`);
    }
  }

  function go(delta) {
    index = Math.max(0, Math.min(slides.length - 1, index + delta));
    render();
  }

  function goTo(nextIndex) {
    index = Math.max(0, Math.min(slides.length - 1, nextIndex));
    render();
  }

  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));

  window.addEventListener("keydown", (event) => {
    const key = event.key;
    if (isMatrixOpen()) {
      if (key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      return;
    }
    if (key === "ArrowRight" || key === "PageDown" || key === " ") {
      event.preventDefault();
      go(1);
    }
    if (key === "ArrowLeft" || key === "PageUp") {
      event.preventDefault();
      go(-1);
    }
    if (key === "Home") {
      event.preventDefault();
      goTo(0);
    }
    if (key === "End") {
      event.preventDefault();
      goTo(slides.length - 1);
    }
    if (key.toLowerCase() === "n") {
      document.body.classList.toggle("show-notes");
      render();
    }
  });

  window.addEventListener("hashchange", () => {
    index = readHash();
    render();
  });

  window.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].screenX;
  }, { passive: true });

  window.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const diff = event.changedTouches[0].screenX - touchStartX;
    if (!isMatrixOpen() && Math.abs(diff) > 48) {
      go(diff < 0 ? 1 : -1);
    }
    touchStartX = null;
  }, { passive: true });

  render();
})();
