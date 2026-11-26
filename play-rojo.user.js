// ==UserScript==
// @name         play-rojo
// @namespace    https://github.com/jschacosta/play-rojo
// @version      0.1.1
// @description  Adelanta y silencia los anuncios de YouTube, oculta banners y permite audio en segundo plano. Reglas remotas que se actualizan solas.
// @author       jschacosta
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/jschacosta/play-rojo/main/play-rojo.user.js
// @downloadURL  https://raw.githubusercontent.com/jschacosta/play-rojo/main/play-rojo.user.js
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const URL_REGLAS = 'https://raw.githubusercontent.com/jschacosta/play-rojo/main/reglas.json';
  const UNA_HORA = 60 * 60 * 1000;
  const PREFIJO = '[play-rojo]';

  // Copia de reglas.json para cuando no hay red ni caché.
  // Se actualiza con `node herramientas/sincronizar.mjs`; no editar a mano.
  /* REGLAS-INICIO */
  const REGLAS_BASE = {
    "version": "2026-11-25.1",
    "reproductor": "#movie_player, .html5-video-player",
    "anuncioActivo": [
      ".ad-showing",
      ".ad-interrupting"
    ],
    "video": "video.html5-main-video, #movie_player video, video",
    "botonesOmitir": [
      ".ytp-skip-ad-button",
      ".ytp-ad-skip-button",
      ".ytp-ad-skip-button-modern",
      ".ytp-ad-skip-button-slot button",
      ".ytp-ad-skip-button-container button",
      "button[id^='skip-button']",
      ".ytm-skip-ad-button"
    ],
    "cerrarSuperpuestos": [
      ".ytp-ad-overlay-close-button",
      ".ytp-ad-overlay-close-container"
    ],
    "indiciosAnuncio": [
      ".ytp-ad-player-overlay",
      ".ytp-ad-player-overlay-layout",
      ".ytp-ad-text",
      ".ytp-ad-preview-container",
      ".video-ads .ytp-ad-module > *"
    ],
    "ocultar": [
      "ytd-ad-slot-renderer",
      "ytd-in-feed-ad-layout-renderer",
      "ytd-banner-promo-renderer",
      "ytd-statement-banner-renderer",
      "ytd-promoted-sparkles-web-renderer",
      "ytd-promoted-video-renderer",
      "ytd-display-ad-renderer",
      "ytd-compact-promoted-video-renderer",
      "ytd-action-companion-ad-renderer",
      "ytd-player-legacy-desktop-watch-ads-renderer",
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-ads']",
      "ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)",
      "ytd-reel-video-renderer:has(.ytd-ad-slot-renderer)",
      "#masthead-ad",
      "#player-ads",
      "#panels > ytd-ads-engagement-panel-content-renderer",
      ".ytp-ad-overlay-container",
      ".ytp-ad-image-overlay",
      "ad-slot-renderer",
      "ytm-promoted-sparkles-web-renderer",
      "ytm-companion-ad-renderer",
      "ytm-rich-item-renderer:has(ad-slot-renderer)"
    ],
    "velocidad": 16,
    "saltarAlFinal": true,
    "segundosParaAviso": 8
  };
  /* REGLAS-FIN */

  const paginaWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const leer = (clave, porDefecto) => {
    try { return GM_getValue(clave, porDefecto); } catch (_) { return porDefecto; }
  };
  const guardar = (clave, valor) => {
    try { GM_setValue(clave, valor); } catch (_) { /* sin almacenamiento */ }
  };

  const opciones = {
    segundoPlano: leer('opcion.segundoPlano', true),
    soloAudio: leer('opcion.soloAudio', false),
  };

  // ---------------------------------------------------------------------------
  // Reglas: caché local + descarga cada hora
  // ---------------------------------------------------------------------------

  function reglasValidas(r) {
    return r && typeof r === 'object'
      && typeof r.version === 'string'
      && typeof r.reproductor === 'string'
      && Array.isArray(r.anuncioActivo) && r.anuncioActivo.length > 0
      && typeof r.video === 'string'
      && Array.isArray(r.botonesOmitir)
      && Array.isArray(r.ocultar);
  }

  function combinar(r) {
    // Lo que falte en las reglas remotas se toma de la base.
    return Object.assign({}, REGLAS_BASE, r);
  }

  let reglas = (() => {
    const enCache = leer('reglas.cache', null);
    return reglasValidas(enCache) ? combinar(enCache) : REGLAS_BASE;
  })();

  function descargarReglas(manual) {
    return new Promise((resolver) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: URL_REGLAS + '?t=' + Date.now(),
        timeout: 15000,
        onload: (res) => {
          try {
            if (res.status !== 200) throw new Error('HTTP ' + res.status);
            const nuevas = JSON.parse(res.responseText);
            if (!reglasValidas(nuevas)) throw new Error('formato inválido');
            guardar('reglas.cache', nuevas);
            guardar('reglas.ultimaDescarga', Date.now());
            const cambio = nuevas.version !== reglas.version;
            reglas = combinar(nuevas);
            aplicarOcultar();
            avisoMostrado = false;
            console.info(PREFIJO, 'reglas', reglas.version, cambio ? '(nuevas)' : '(sin cambios)');
            if (manual) mostrarAviso('Reglas al día: versión ' + reglas.version);
            resolver(true);
          } catch (e) {
            console.warn(PREFIJO, 'no se pudieron leer las reglas:', e.message);
            if (manual) mostrarAviso('No se pudieron descargar las reglas (' + e.message + ').');
            resolver(false);
          }
        },
        onerror: () => {
          if (manual) mostrarAviso('Sin conexión con GitHub; se usan las reglas guardadas.');
          resolver(false);
        },
        ontimeout: () => {
          if (manual) mostrarAviso('GitHub tardó demasiado; se usan las reglas guardadas.');
          resolver(false);
        },
      });
    });
  }

  function revisarActualizacion() {
    const ultima = leer('reglas.ultimaDescarga', 0);
    if (Date.now() - ultima > UNA_HORA) descargarReglas(false);
  }

  // ---------------------------------------------------------------------------
  // Audio en segundo plano: la página siempre cree que está visible
  // ---------------------------------------------------------------------------

  function activarSegundoPlano() {
    const doc = paginaWin.document;
    const exportar = typeof exportFunction === 'function'
      ? (fn) => exportFunction(fn, paginaWin) // Firefox: los getters deben vivir en la página
      : (fn) => fn;
    const definir = (nombre, valor) => {
      try {
        Object.defineProperty(doc, nombre, { get: exportar(() => valor), configurable: true });
      } catch (e) {
        console.warn(PREFIJO, 'no se pudo fijar', nombre, e.message);
      }
    };
    definir('hidden', false);
    definir('webkitHidden', false);
    definir('visibilityState', 'visible');
    definir('webkitVisibilityState', 'visible');
    try {
      doc.hasFocus = exportar(() => true);
    } catch (_) { /* no crítico */ }

    // Se registra en captura sobre window antes que YouTube, así el evento no llega a sus oyentes.
    // Solo los eventos de la ventana o el documento: el blur de un campo de texto debe seguir llegando.
    const frenar = (ev) => {
      if (ev.target === window || ev.target === document) ev.stopImmediatePropagation();
    };
    for (const tipo of ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze']) {
      window.addEventListener(tipo, frenar, true);
      document.addEventListener(tipo, frenar, true);
    }
  }

  if (opciones.segundoPlano) activarSegundoPlano();

  // ---------------------------------------------------------------------------
  // Estilos: ocultar banners y modo solo audio
  // ---------------------------------------------------------------------------

  let estiloOcultar = null;
  let estiloSoloAudio = null;

  function insertarEstilo(css) {
    const el = document.createElement('style');
    el.setAttribute('data-play-rojo', '');
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
    return el;
  }

  function cssSeguro(selectores) {
    // Un selector inválido anula toda la regla CSS; se descartan uno por uno.
    return selectores.filter((s) => {
      try { document.querySelector(s); return true; } catch (_) { return false; }
    });
  }

  function aplicarOcultar() {
    const lista = cssSeguro(reglas.ocultar || []);
    const css = lista.length ? lista.join(',\n') + ' { display: none !important; }' : '';
    if (!estiloOcultar || !estiloOcultar.isConnected) estiloOcultar = insertarEstilo(css);
    else estiloOcultar.textContent = css;
  }

  function aplicarSoloAudio() {
    const css = opciones.soloAudio
      ? '#movie_player video, .html5-video-player video { opacity: 0 !important; }\n'
        + '#movie_player::after { content: "Solo audio · play-rojo"; position: absolute; inset: 0;'
        + ' display: flex; align-items: center; justify-content: center; color: #fff;'
        + ' font: 600 18px system-ui, sans-serif; pointer-events: none; }'
      : '';
    if (!estiloSoloAudio || !estiloSoloAudio.isConnected) estiloSoloAudio = insertarEstilo(css);
    else estiloSoloAudio.textContent = css;
    if (opciones.soloAudio) bajarCalidad();
    else if (estiloSoloAudio.dataset.antes === '1') restaurarCalidad();
    estiloSoloAudio.dataset.antes = opciones.soloAudio ? '1' : '0';
  }

  function restaurarCalidad() {
    try {
      const jugador = paginaWin.document.getElementById('movie_player');
      if (jugador && typeof jugador.setPlaybackQualityRange === 'function') {
        jugador.setPlaybackQualityRange('auto', 'auto');
      }
    } catch (_) { /* no crítico */ }
  }

  function bajarCalidad() {
    // Usa la API del reproductor de la página; si no está disponible, solo queda el video oculto.
    try {
      const jugador = paginaWin.document.getElementById('movie_player');
      if (jugador && typeof jugador.setPlaybackQualityRange === 'function') {
        jugador.setPlaybackQualityRange('tiny', 'tiny');
      }
    } catch (_) { /* no crítico */ }
  }

  // ---------------------------------------------------------------------------
  // Anuncios del reproductor
  // ---------------------------------------------------------------------------

  let enAnuncio = false;
  let estadoPrevio = null; // { muted, rate }
  let inicioAnuncio = 0;
  let avisoMostrado = false;
  let anunciosAdelantados = 0;

  function buscar(selector, raiz) {
    try { return (raiz || document).querySelector(selector); } catch (_) { return null; }
  }

  function visible(el) {
    return !!el && el.offsetParent !== null && el.getClientRects().length > 0;
  }

  function hayAnuncio(jugador) {
    return reglas.anuncioActivo.some((s) => {
      try { return jugador.matches(s) || !!jugador.querySelector(s); } catch (_) { return false; }
    });
  }

  function hayIndicios(jugador) {
    return (reglas.indiciosAnuncio || []).some((s) => visible(buscar(s, jugador)));
  }

  function clicOmitir(jugador) {
    for (const s of reglas.botonesOmitir.concat(reglas.cerrarSuperpuestos || [])) {
      const boton = buscar(s, jugador) || buscar(s);
      if (boton && visible(boton)) {
        boton.click();
        return true;
      }
    }
    return false;
  }

  // Si YouTube tarda en quitar la marca de anuncio, el <video> ya puede tener el contenido real.
  // Se compara con la duración del video pedido para no saltarlo por error.
  function esElVideoReal(video) {
    try {
      const jugador = paginaWin.document.getElementById('movie_player');
      const respuesta = jugador && typeof jugador.getPlayerResponse === 'function' && jugador.getPlayerResponse();
      const largo = Number(respuesta && respuesta.videoDetails && respuesta.videoDetails.lengthSeconds);
      return largo > 0 && Math.abs(video.duration - largo) < 2;
    } catch (_) {
      return false;
    }
  }

  function adelantar(video) {
    if (!video) return;
    if (!video.muted) video.muted = true;
    const vel = Number(reglas.velocidad) || 16;
    if (video.playbackRate !== vel) {
      try { video.playbackRate = vel; } catch (_) { video.playbackRate = 4; }
    }
    if (reglas.saltarAlFinal && Number.isFinite(video.duration) && video.duration > 0
        && video.currentTime < video.duration - 0.3 && !esElVideoReal(video)) {
      try { video.currentTime = video.duration - 0.1; } catch (_) { /* algunos anuncios no dejan */ }
    }
    if (video.paused) video.play().catch(() => {});
  }

  function revisar() {
    const jugador = buscar(reglas.reproductor);
    if (!jugador) return;
    const video = buscar(reglas.video, jugador);
    const anuncio = hayAnuncio(jugador);

    if (anuncio) {
      if (!enAnuncio) {
        enAnuncio = true;
        inicioAnuncio = Date.now();
        estadoPrevio = video ? { muted: video.muted, rate: video.playbackRate === (Number(reglas.velocidad) || 16) ? 1 : video.playbackRate } : null;
        anunciosAdelantados++;
      }
      clicOmitir(jugador);
      adelantar(video);
      const limite = (Number(reglas.segundosParaAviso) || 8) * 1000;
      if (!avisoMostrado && Date.now() - inicioAnuncio > limite) {
        avisarReglasViejas('el anuncio sigue en pantalla después de ' + Math.round(limite / 1000) + ' s');
      }
      return;
    }

    if (enAnuncio) {
      enAnuncio = false;
      if (video && estadoPrevio) {
        video.muted = estadoPrevio.muted;
        video.playbackRate = estadoPrevio.rate || 1;
      }
      estadoPrevio = null;
      if (opciones.soloAudio) bajarCalidad();
    }

    // Se ve interfaz de anuncio, pero ninguna regla de "anuncio activo" lo detectó.
    if (!avisoMostrado && hayIndicios(jugador)) {
      avisarReglasViejas('se ve un anuncio que las reglas no reconocen');
    }
  }

  function avisarReglasViejas(motivo) {
    avisoMostrado = true;
    console.warn(PREFIJO, 'reglas desactualizadas:', motivo, '· versión', reglas.version);
    mostrarAviso('Reglas desactualizadas (' + motivo + '). Usa "Actualizar reglas ahora" o avisa que se rompió.');
    try {
      GM_notification({ title: 'play-rojo', text: 'Reglas desactualizadas: ' + motivo, timeout: 8000 });
    } catch (_) { /* sin notificaciones */ }
  }

  // ---------------------------------------------------------------------------
  // Aviso en pantalla
  // ---------------------------------------------------------------------------

  function mostrarAviso(texto) {
    const poner = () => {
      const caja = document.createElement('div');
      caja.textContent = 'play-rojo · ' + texto;
      caja.style.cssText = [
        'position:fixed', 'z-index:2147483647', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
        'max-width:min(90vw,520px)', 'padding:12px 16px', 'border-radius:8px',
        'background:#1f1f1f', 'color:#fff', 'border-left:4px solid #e53935',
        'font:500 14px/1.4 system-ui,sans-serif', 'box-shadow:0 4px 16px rgba(0,0,0,.35)',
      ].join(';');
      document.body.appendChild(caja);
      setTimeout(() => caja.remove(), 7000);
    };
    if (document.body) poner();
    else document.addEventListener('DOMContentLoaded', poner, { once: true });
  }

  // ---------------------------------------------------------------------------
  // Menú de Tampermonkey
  // ---------------------------------------------------------------------------

  const idsMenu = [];

  function armarMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (typeof GM_unregisterMenuCommand === 'function') {
      while (idsMenu.length) GM_unregisterMenuCommand(idsMenu.pop());
    }
    idsMenu.push(GM_registerMenuCommand('Actualizar reglas ahora', () => descargarReglas(true)));
    idsMenu.push(GM_registerMenuCommand(
      (opciones.soloAudio ? '✓ ' : '') + 'Solo audio',
      () => {
        opciones.soloAudio = !opciones.soloAudio;
        guardar('opcion.soloAudio', opciones.soloAudio);
        aplicarSoloAudio();
        mostrarAviso('Solo audio ' + (opciones.soloAudio ? 'activado' : 'desactivado') + '.');
        armarMenu();
      }
    ));
    idsMenu.push(GM_registerMenuCommand(
      (opciones.segundoPlano ? '✓ ' : '') + 'Audio en segundo plano',
      () => {
        opciones.segundoPlano = !opciones.segundoPlano;
        guardar('opcion.segundoPlano', opciones.segundoPlano);
        mostrarAviso('Audio en segundo plano ' + (opciones.segundoPlano ? 'activado' : 'desactivado')
          + '. Recarga la página para aplicarlo.');
        armarMenu();
      }
    ));
    idsMenu.push(GM_registerMenuCommand('Ver estado', () => {
      const ultima = leer('reglas.ultimaDescarga', 0);
      mostrarAviso('Reglas ' + reglas.version
        + ' · descargadas ' + (ultima ? new Date(ultima).toLocaleString() : 'nunca')
        + ' · anuncios adelantados en esta pestaña: ' + anunciosAdelantados);
    }));
  }

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------

  function observarReproductor() {
    let observado = null;
    const observador = new MutationObserver(revisar);
    setInterval(() => {
      const jugador = buscar(reglas.reproductor);
      if (jugador && jugador !== observado) {
        observador.disconnect();
        observador.observe(jugador, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
        observado = jugador;
      }
      revisar(); // respaldo por si el observador se pierde algo
    }, 300);
  }

  function arrancar() {
    aplicarOcultar();
    aplicarSoloAudio();
    observarReproductor();
    armarMenu();
    revisarActualizacion();
    setInterval(revisarActualizacion, 10 * 60 * 1000);
    // YouTube es una SPA: al navegar se reemplazan nodos y estilos de la cabecera.
    document.addEventListener('yt-navigate-finish', () => { aplicarOcultar(); aplicarSoloAudio(); });
  }

  if (document.documentElement) arrancar();
  else document.addEventListener('DOMContentLoaded', arrancar, { once: true });
})();
