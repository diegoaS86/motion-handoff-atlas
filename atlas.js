/*
  Motion Handoff · Project Atlas — render.

  Lê atlas-data.json e desenha uma timeline. Nada é decidido aqui: nenhum
  estado, percentual, conclusão de fase ou coordenada do eixo nasce neste
  arquivo. A geometria (`start`, `end`, `ratio`, `marker`) vem inteira da
  projeção, e é por isso que ela pode passar a ser temporal sem que a interface
  mude.

  O Atlas não executa mutação: há uma leitura de JSON e links que abrem o
  GitHub Project em outra aba.
*/
(function () {
  'use strict';

  var root = document.getElementById('atlas');
  var errorBox = document.getElementById('atlas-error');

  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    apply(node, attrs);
    append(node, children);
    return node;
  }

  function apply(node, attrs) {
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.setAttribute('class', value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
  }

  function append(node, children) {
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
  }

  // ── ícones ─────────────────────────────────────────────────────────
  //
  // Traços mínimos, 12×12, em currentColor. Servem ao scan visual: um por
  // linha, nunca uma coleção de pictogramas por linha.

  var SVG = 'http://www.w3.org/2000/svg';

  var PATHS = {
    chevron: ['M4.5 2.5L8.5 6l-4 3.5'],
    check: ['M2.5 6.2l2.4 2.4 4.6-5'],
    circle: ['M6 2.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8'],
    pause: ['M4.6 3.4v5.2', 'M7.4 3.4v5.2'],
    diamond: ['M6 1.8l4.2 4.2L6 10.2 1.8 6z'],
    layers: ['M6 1.8l4.4 2.2L6 6.2 1.6 4z', 'M1.6 7.2L6 9.4l4.4-2.2'],
    milestone: ['M3 1.8v8.4', 'M3 2.6h6l-1.6 2 1.6 2H3'],
    external: ['M4.2 7.8L8.4 3.6', 'M5.4 3.6h3v3'],
  };

  /** Filled dot for "corrente": the one icon that reads as a marker, not a shape. */
  function icon(name, filled) {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    (PATHS[name] || PATHS.circle).forEach(function (d) {
      var path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      if (filled) path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
    });
    return svg;
  }

  /* Status → ícone. O nome do Status viaja em `title`, não em texto na linha. */
  var STATUS_ICON = {
    Done: ['check', false],
    Now: ['circle', true],
    Review: ['circle', true],
    Approved: ['circle', true],
    Blocked: ['diamond', false],
    Waiting: ['pause', false],
  };

  function statusIcon(status) {
    var spec = STATUS_ICON[status] || ['circle', false];
    var node = el('span', { class: 'ico', 'data-state': status || 'Unmanaged', title: status || 'sem status gerenciado' });
    node.appendChild(icon(spec[0], spec[1]));
    return node;
  }

  // ── barras ─────────────────────────────────────────────────────────

  /**
   * A barra é um objeto no eixo: `--s`/`--e` posicionam, `--f` preenche.
   *
   * A fração só é escrita dentro dela quando algo já fechou — repetir `0/1` em
   * toda linha seria ruído — e o CSS ainda a esconde quando não couber.
   */
  function bar(spec) {
    var lane = spec.lane || { start: 0, end: 1 };
    var progress = spec.progress;
    var ratio = progress && progress.ratio ? progress.ratio : 0;
    var done = Boolean(spec.done) || (progress && progress.state === 'COMPLETE');

    var attrs = {
      class: 'bar',
      style: '--s:' + lane.start + ';--e:' + lane.end + ';--f:' + ratio,
      'data-band': spec.band || null,
      'data-state': spec.status || null,
      'data-done': done ? 'true' : null,
      title: tooltip(spec),
    };
    if (spec.href) {
      attrs.href = spec.href;
      attrs.target = '_blank';
      attrs.rel = 'noopener';
      // O rótulo à esquerda já é o link acessível da linha; a barra repete o
      // destino só como alvo de clique.
      attrs.tabindex = '-1';
      attrs['aria-hidden'] = 'true';
    }

    var node = el(spec.href ? 'a' : 'div', attrs);
    if (ratio > 0 && !done) node.appendChild(el('i', {}));
    if (progress && progress.done > 0) {
      node.appendChild(el('span', {
        class: 'bval',
        text: progress.state === 'COMPLETE' ? '✓ ' + progress.done : progress.done + '/' + progress.total,
      }));
    }
    return node;
  }

  /** O dado detalhado vive no hover, não repetido em cada linha. */
  function tooltip(spec) {
    var parts = [spec.id || spec.name];
    if (spec.status) parts.push(spec.status);
    if (spec.progress && spec.progress.state !== 'EMPTY') {
      parts.push(spec.progress.done + '/' + spec.progress.total + ' unidades');
    } else if (spec.progress) {
      parts.push('sem unidades canônicas');
    }
    return parts.join(' · ');
  }

  // ── linhas ─────────────────────────────────────────────────────────

  /**
   * Uma linha e, quando houver, o grupo de filhos que a segue — entre ela e o
   * próximo sibling, que é o que faz a expansão ler como hierarquia.
   */
  function row(spec) {
    var inner = spec.children && spec.children.length ? el('div', { class: 'group-inner' }, spec.children) : null;
    var group = inner ? el('div', { class: 'group', 'data-open': spec.open ? 'true' : 'false' }, [inner]) : null;

    var lead;
    if (group) {
      lead = el('button', {
        class: 'chev',
        type: 'button',
        'aria-expanded': spec.open ? 'true' : 'false',
        'aria-label': (spec.open ? 'Recolher ' : 'Expandir ') + spec.name,
      });
      lead.appendChild(icon('chevron'));
      inner.inert = !spec.open;
      lead.addEventListener('click', function () {
        var open = lead.getAttribute('aria-expanded') !== 'true';
        lead.setAttribute('aria-expanded', open ? 'true' : 'false');
        lead.setAttribute('aria-label', (open ? 'Recolher ' : 'Expandir ') + spec.name);
        group.setAttribute('data-open', open ? 'true' : 'false');
        inner.inert = !open;
      });
    } else if (spec.icon) {
      lead = el('span', { class: 'ico' });
      lead.appendChild(icon(spec.icon));
    } else {
      lead = statusIcon(spec.status);
    }

    var labelAttrs = { class: 'nlabel' };
    if (spec.href) {
      labelAttrs.href = spec.href;
      labelAttrs.target = '_blank';
      labelAttrs.rel = 'noopener';
    }
    var label = el(spec.href ? 'a' : 'span', labelAttrs, [
      spec.key ? el('span', { class: 'key', text: spec.key }) : null,
      el('span', { class: 'txt', text: spec.name, title: spec.name }),
    ]);

    var line = el('div', {
      class: 'row row--' + spec.kind,
      'data-current': spec.current ? 'true' : null,
    }, [
      el('div', { class: 'rname ' + (spec.level ? 'lvl-' + spec.level : '') }, [lead, label]),
      el('div', { class: 'rtrack' }, [spec.track === false ? null : bar(spec)]),
      el('div', { class: 'rgut' }),
    ]);

    return group ? [line, group] : [line];
  }

  // ── seções ─────────────────────────────────────────────────────────

  function itemRow(item) {
    return row({
      kind: 'item',
      level: 2,
      name: item.title || item.key,
      key: item.key,
      id: item.id || item.key,
      href: item.href,
      status: item.status,
      done: item.done,
      lane: item.lane,
      progress: item.progress,
      band: item.band,
    });
  }

  function phaseRow(phase) {
    var children = [];
    if (phase.expandable) phase.items.forEach(function (item) { children = children.concat(itemRow(item)); });
    return row({
      kind: 'phase',
      level: 1,
      name: phase.display.replace(/^F\d\s·\s/, ''),
      key: phase.ordinal,
      id: phase.phase,
      href: phase.href,
      current: phase.current,
      lane: phase.lane,
      progress: phase.progress,
      band: phase.progress.done > 0 ? null : 'future',
      status: phase.complete ? 'Done' : phase.current ? 'Now' : 'Backlog',
      icon: phase.expandable ? null : 'milestone',
      open: phase.current,
      children: children,
    });
  }

  function checkpointRow(checkpoint) {
    // Consolida no fim do eixo, sem unidade e sem progresso: não é fase, então
    // marca um ponto em vez de ocupar um intervalo.
    var line = row({ kind: 'lane', level: 1, name: checkpoint.display, icon: 'diamond', track: false })[0];
    line.querySelector('.rtrack').appendChild(el('span', { class: 'rmark', style: '--x:1', title: checkpoint.display }));
    return [line];
  }

  function trackRow(item) {
    return row({
      kind: 'lane',
      level: 1,
      name: item.display,
      id: item.phase,
      href: item.href,
      icon: 'layers',
      lane: { start: 0, end: 1 },
      progress: item.progress,
      band: item.progress.done > 0 ? null : 'future',
    });
  }

  function domainRow(domain, index, total) {
    return row({
      kind: 'lane',
      level: 1,
      name: domain,
      icon: 'circle',
      // Direção futura, sem unidade própria: faixas escalonadas para não
      // virarem cinco linhas idênticas.
      lane: { start: 0, end: (index + 1) / total },
      band: 'future',
    });
  }

  function ruler(data) {
    var segments = data.mvp.phases.map(function (phase) {
      return el('span', {
        class: 'seg',
        'data-current': phase.current ? 'true' : null,
        style: '--s:' + phase.lane.start + ';--e:' + phase.lane.end,
        text: phase.ordinal,
      });
    });
    if (data.mvp.marker !== null && data.mvp.marker !== undefined) {
      segments.push(el('span', { class: 'now-head', style: '--x:' + data.mvp.marker, text: 'NOW' }));
    }
    return el('div', { class: 'row ruler' }, [
      el('div', { class: 'rname', text: 'Roadmap' }),
      el('div', { class: 'rtrack' }, segments),
      el('div', { class: 'rgut' }),
    ]);
  }

  /** Limites de fase e o marcador de posição atual, por cima do grid. */
  function overlay(data) {
    var edges = data.mvp.phases.slice(0, -1).map(function (phase) {
      return el('span', { class: 'edge', style: '--x:' + phase.lane.end });
    });
    if (data.mvp.marker !== null && data.mvp.marker !== undefined) {
      edges.push(el('span', { class: 'now', style: '--x:' + data.mvp.marker }));
    }
    return el('div', { class: 'overlay' }, edges);
  }

  function rows(data) {
    var mvpChildren = [];
    data.mvp.phases.forEach(function (phase) { mvpChildren = mvpChildren.concat(phaseRow(phase)); });
    mvpChildren = mvpChildren.concat(checkpointRow(data.mvp.checkpoint));
    data.crossCutting.tracks.forEach(function (item) { mvpChildren = mvpChildren.concat(trackRow(item)); });

    var postChildren = [];
    data.postMvp.domains.forEach(function (domain, index) {
      postChildren = postChildren.concat(domainRow(domain, index, data.postMvp.domains.length));
    });

    var all = row({
      kind: 'horizon',
      name: 'MVP',
      id: 'MVP',
      href: data.mvp.href,
      icon: 'layers',
      lane: { start: 0, end: 1 },
      progress: data.mvp.progress,
      band: data.mvp.progress.done > 0 ? null : 'future',
      open: true,
      children: mvpChildren,
    });

    return all.concat(row({
      kind: 'horizon',
      name: 'Post-MVP',
      id: 'POST_MVP',
      href: data.postMvp.href,
      icon: 'layers',
      lane: { start: 0, end: 1 },
      progress: data.postMvp.progress,
      band: 'future',
      open: false,
      children: postChildren,
    }));
  }

  function topbar(data) {
    var link = null;
    if (data.links.project) {
      link = el('a', { class: 'ext', href: data.links.project, target: '_blank', rel: 'noopener' },
        [el('span', { text: 'GitHub Project' })]);
      link.appendChild(icon('external'));
    }
    return el('header', { class: 'topbar' }, [el('h1', { text: 'Motion Handoff' }), link]);
  }

  function render(data) {
    root.textContent = '';
    root.appendChild(topbar(data));

    var canvas = el('div', { class: 'canvas' }, [ruler(data)].concat(rows(data)));
    canvas.appendChild(overlay(data));

    // Uma fonte ilegível não pode falhar em silêncio: indicador de erro, não
    // documentação, e some assim que a fonte volta a ser legível.
    if (data.problems.length) {
      canvas.appendChild(el('p', {
        class: 'trouble',
        text: 'fonte canônica ilegível: ' + data.problems.map(function (problem) {
          return problem.kind + (problem.id ? ' ' + problem.id : '');
        }).join('; '),
      }));
    }

    root.appendChild(el('div', { class: 'board' }, [canvas]));
    root.hidden = false;
  }

  var inline = document.getElementById('atlas-data');
  if (inline) {
    try {
      render(JSON.parse(inline.textContent));
    } catch (error) {
      fail('atlas-data inválido: ' + error.message);
    }
  } else {
    fetch('atlas-data.json')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(render)
      .catch(function (error) { fail('não foi possível carregar atlas-data.json: ' + error.message); });
  }
})();
