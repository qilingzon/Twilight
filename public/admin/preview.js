(function () {
  "use strict";

  function whenReady(fn) {
    var start = Date.now();
    (function tick() {
      if (typeof window !== "undefined" && window.CMS && window.React) {
        fn(window.CMS, window.React);
        return;
      }
      if (Date.now() - start > 8000) return;
      setTimeout(tick, 25);
    })();
  }

  function text(entry, path, fallback) {
    try {
      if (!entry) return fallback;
      if (typeof entry.getIn === "function") {
        var v = entry.getIn(["data"].concat(path));
        return v == null ? fallback : String(v);
      }
    } catch (_e) {}
    return fallback;
  }

  function bool(entry, path, fallback) {
    try {
      if (!entry || typeof entry.getIn !== "function") return fallback;
      var v = entry.getIn(["data"].concat(path));
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v === "true";
      return fallback;
    } catch (_e) {}
    return fallback;
  }

  function list(entry, path) {
    try {
      if (!entry || typeof entry.getIn !== "function") return [];
      var v = entry.getIn(["data"].concat(path));
      if (!v) return [];
      if (Array.isArray(v)) return v;
      if (typeof v.toJS === "function") return v.toJS();
      return [];
    } catch (_e) {}
    return [];
  }

  whenReady(function (CMS, React) {
    var h = React.createElement;

    function MetaRow(props) {
      return h(
        "div",
        { className: "cms-preview-meta" },
        h("span", { className: "cms-preview-meta__label" }, props.label),
        h("span", { className: "cms-preview-meta__value" }, props.value)
      );
    }

    function PostPreview(props) {
      var entry = props.entry;
      var title = text(entry, ["title"], "(未命名文章)");
      var description = text(entry, ["description"], "");
      var cover = text(entry, ["cover"], "");
      var published = text(entry, ["published"], "");
      var updated = text(entry, ["updated"], "");
      var pinned = bool(entry, ["pinned"], false);
      var draft = bool(entry, ["draft"], false);
      var encrypted = bool(entry, ["encrypted"], false);
      var tags = list(entry, ["tags"]);

      return h(
        "article",
        { className: "cms-preview" },
        cover ? h("img", { className: "cms-preview-cover", src: cover, alt: "" }) : null,
        h("h1", null, title),
        description ? h("p", { className: "cms-preview-lead" }, description) : null,
        h(
          "section",
          { className: "cms-preview-metaBox" },
          published ? h(MetaRow, { label: "发布时间", value: published }) : null,
          updated ? h(MetaRow, { label: "更新时间", value: updated }) : null,
          pinned ? h(MetaRow, { label: "置顶", value: "是" }) : null,
          draft ? h(MetaRow, { label: "草稿", value: "是" }) : null,
          encrypted ? h(MetaRow, { label: "加密", value: "是" }) : null,
          tags && tags.length ? h(MetaRow, { label: "标签", value: tags.join(", ") }) : null
        ),
        h("hr", null),
        h("div", { className: "cms-preview-body" }, props.widgetFor("body"))
      );
    }

    function DiaryPreview(props) {
      var entry = props.entry;
      var title = text(entry, ["title"], "(未命名日记)");
      var content = text(entry, ["content"], "");
      var date = text(entry, ["date"], "");
      var images = list(entry, ["images"]);

      return h(
        "article",
        { className: "cms-preview" },
        h("h1", null, title),
        date ? h("p", { className: "cms-preview-lead" }, date) : null,
        content ? h("p", null, content) : null,
        images && images.length
          ? h(
              "div",
              { className: "cms-preview-gallery" },
              images
                .map(function (x) {
                  if (!x) return null;
                  var url = typeof x === "string" ? x : x.image || x.src;
                  if (!url) return null;
                  return h("img", { key: url, src: url, alt: "" });
                })
                .filter(Boolean)
            )
          : null
      );
    }

    function ProjectPreview(props) {
      var entry = props.entry;
      var title = text(entry, ["title"], "(未命名项目)");
      var description = text(entry, ["description"], "");
      var image = text(entry, ["image"], "");
      var techStack = list(entry, ["techStack"]);

      return h(
        "article",
        { className: "cms-preview" },
        image ? h("img", { className: "cms-preview-cover", src: image, alt: "" }) : null,
        h("h1", null, title),
        description ? h("p", { className: "cms-preview-lead" }, description) : null,
        techStack && techStack.length ? h(MetaRow, { label: "技术栈", value: techStack.join(", ") }) : null
      );
    }

    function AlbumPreview(props) {
      var entry = props.entry;
      var title = text(entry, ["title"], "(未命名相册)");
      var description = text(entry, ["description"], "");
      var cover = text(entry, ["cover"], "");
      var photos = list(entry, ["photos"]);

      return h(
        "article",
        { className: "cms-preview" },
        cover ? h("img", { className: "cms-preview-cover", src: cover, alt: "" }) : null,
        h("h1", null, title),
        description ? h("p", { className: "cms-preview-lead" }, description) : null,
        photos && photos.length
          ? h(
              "div",
              { className: "cms-preview-gallery" },
              photos
                .map(function (p) {
                  if (!p) return null;
                  var url = p.src || p.image;
                  if (!url) return null;
                  return h("img", { key: url, src: url, alt: p.alt || "" });
                })
                .filter(Boolean)
            )
          : null
      );
    }

    try {
      CMS.registerPreviewTemplate("posts", PostPreview);
      CMS.registerPreviewTemplate("diary", DiaryPreview);
      CMS.registerPreviewTemplate("projects", ProjectPreview);
      CMS.registerPreviewTemplate("albums", AlbumPreview);
    } catch (_e) {
      // No-op: keep admin usable even if preview registration fails.
    }
  });
})();
