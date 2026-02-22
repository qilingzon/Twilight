(function () {
  "use strict";

  function encodePath(path) {
    return String(path)
      .split("/")
      .map(function (seg) {
        return encodeURIComponent(seg);
      })
      .join("/");
  }

  function stripInlineComment(value) {
    var s = String(value || "");
    var hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(0, hash);
    return s.trim().replace(/^['"]|['"]$/g, "");
  }

  async function loadCmsConfigQuick() {
    try {
      var res = await fetch("/admin/config.yml", { cache: "no-store" });
      if (!res.ok) return null;
      var text = await res.text();

      var repoMatch = text.match(/^\s*repo\s*:\s*(.+)$/m);
      var branchMatch = text.match(/^\s*branch\s*:\s*(.+)$/m);

      var repo = repoMatch ? stripInlineComment(repoMatch[1]) : "";
      var branch = branchMatch ? stripInlineComment(branchMatch[1]) : "main";

      if (!repo) return null;
      return { repo: repo, branch: branch || "main" };
    } catch (_e) {
      return null;
    }
  }

  function getGithubToken() {
    try {
      var raw = window.localStorage.getItem("decap-cms-user");
      if (!raw) return "";
      var obj = JSON.parse(raw);
      return obj && (obj.token || obj.access_token || obj.accessToken) ? String(obj.token || obj.access_token || obj.accessToken) : "";
    } catch (_e) {
      return "";
    }
  }

  function isSafeCanonicalFilename(filename) {
    // cover-YYYYMMDDHHmmss-<hex4>.ext or img-YYYYMMDDHHmmss-<hex4>.ext
    return /^(?:cover|img)-\d{14}-[a-f0-9]{4}\.[a-z0-9]+$/i.test(filename);
  }

  function fileExt(name) {
    var m = String(name).match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function timestamp14(d) {
    return (
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  async function githubGetJson(apiRoot, token, pathWithQuery) {
    var res = await fetch(apiRoot + pathWithQuery, {
      method: "GET",
      headers: {
        Authorization: token ? "token " + token : "",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      var msg = "";
      try {
        msg = await res.text();
      } catch (_e) {}
      throw new Error("GitHub API GET failed: " + res.status + " " + msg);
    }
    return await res.json();
  }

  async function githubPutJson(apiRoot, token, path, body) {
    var res = await fetch(apiRoot + path, {
      method: "PUT",
      headers: {
        Authorization: token ? "token " + token : "",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var msg = "";
      try {
        msg = await res.text();
      } catch (_e) {}
      throw new Error("GitHub API PUT failed: " + res.status + " " + msg);
    }
    return await res.json();
  }

  async function githubDeleteJson(apiRoot, token, path, body) {
    var res = await fetch(apiRoot + path, {
      method: "DELETE",
      headers: {
        Authorization: token ? "token " + token : "",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var msg = "";
      try {
        msg = await res.text();
      } catch (_e) {}
      throw new Error("GitHub API DELETE failed: " + res.status + " " + msg);
    }
    return await res.json();
  }

  async function renameAssetViaGithub(apiRoot, token, repo, branch, oldPublicUrl, newFilename) {
    // Convert /assets/... => public/assets/...
    var oldRepoPath = "public" + oldPublicUrl;
    oldRepoPath = oldRepoPath.replace(/^public\//, "public/");
    var lastSlash = oldRepoPath.lastIndexOf("/");
    var dir = lastSlash >= 0 ? oldRepoPath.slice(0, lastSlash) : "public";
    var newRepoPath = dir + "/" + newFilename;
    var newPublicUrl = newRepoPath.replace(/^public/, "");

    var getPath = "/repos/" + repo + "/contents/" + encodePath(oldRepoPath) + "?ref=" + encodeURIComponent(branch);
    var file = await githubGetJson(apiRoot, token, getPath);

    var sha = String(file.sha || "");
    var ext = fileExt(newFilename);
    if (!ext) throw new Error("Cannot determine extension for new filename");

    await githubPutJson(apiRoot, token, "/repos/" + repo + "/contents/" + encodePath(newRepoPath), {
      message: "chore(media): rename asset",
      content: file.content,
      branch: branch,
    });

    await githubDeleteJson(apiRoot, token, "/repos/" + repo + "/contents/" + encodePath(oldRepoPath), {
      message: "chore(media): remove old asset",
      sha: sha,
      branch: branch,
    });

    return { oldUrl: oldPublicUrl, newUrl: newPublicUrl, sha: sha };
  }

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

    // Media auto-rename (recommended defaults): only for posts, only for assets inside
    // /assets/images/posts/<slug>/..., and only when filenames are not canonical.
    try {
      var inFlight = false;
      CMS.registerEventListener({
        name: "preSave",
        handler: async function (evt) {
          if (inFlight) return;
          inFlight = true;
          try {
            if (!evt || !evt.entry || typeof evt.entry.get !== "function") return;

            var collection = evt.entry.get("collection");
            if (collection !== "posts" && collection !== "diary" && collection !== "albums" && collection !== "projects") return;

            var slug = evt.entry.get("slug");
            if (!slug) {
              var p = evt.entry.get("path");
              if (p && typeof p === "string") {
                var base = p.split("/").pop() || "";
                slug = base.replace(/\.[a-z0-9]+$/i, "");
              }
            }
            if (!slug) return;

            var data = evt.entry.get("data");
            if (!data || typeof data.get !== "function") return;

            var token = getGithubToken();
            if (!token) return;

            var cfg = await loadCmsConfigQuick();
            if (!cfg || !cfg.repo) return;

            var apiRoot = window.location.origin + "/github-api";
            var allowedPrefix;
            if (collection === "posts") allowedPrefix = "/assets/images/posts/" + slug + "/";
            else if (collection === "diary") allowedPrefix = "/assets/images/diary/" + slug + "/";
            else if (collection === "albums") allowedPrefix = "/assets/images/albums/" + slug + "/";
            else if (collection === "projects") allowedPrefix = "/assets/images/projects/" + slug + "/";
            else return;

            var candidateUrls = [];

            // posts
            var cover = collection === "posts" ? data.get("cover") || "" : "";
            var body = collection === "posts" ? data.get("body") || "" : "";

            if (collection === "posts") {
              if (typeof cover === "string" && cover.indexOf(allowedPrefix) === 0) candidateUrls.push(cover);
              if (typeof body === "string" && body.indexOf(allowedPrefix) >= 0) {
                var re = /\]\((\/assets\/images\/[^)\s]+)\)/g;
                var m;
                while ((m = re.exec(body))) {
                  if (m[1] && m[1].indexOf(allowedPrefix) === 0) candidateUrls.push(m[1]);
                }
              }
            }

            // diary (json)
            if (collection === "diary") {
              var images = data.get("images");
              if (images && typeof images.forEach === "function") {
                images.forEach(function (it) {
                  try {
                    var url = "";
                    if (typeof it === "string") url = it;
                    else if (it && typeof it.get === "function") url = it.get("image") || it.get("src") || "";
                    if (typeof url === "string" && url.indexOf(allowedPrefix) === 0) candidateUrls.push(url);
                  } catch (_e) {}
                });
              }
            }

            // projects (json)
            if (collection === "projects") {
              var projImg = data.get("image") || "";
              if (typeof projImg === "string" && projImg.indexOf(allowedPrefix) === 0) candidateUrls.push(projImg);
            }

            // albums (json)
            if (collection === "albums") {
              var albumCover = data.get("cover") || "";
              if (typeof albumCover === "string" && albumCover.indexOf(allowedPrefix) === 0) candidateUrls.push(albumCover);
              var photos = data.get("photos");
              if (photos && typeof photos.forEach === "function") {
                photos.forEach(function (p) {
                  try {
                    var url = "";
                    if (p && typeof p.get === "function") url = p.get("src") || p.get("image") || "";
                    if (typeof url === "string" && url.indexOf(allowedPrefix) === 0) candidateUrls.push(url);
                  } catch (_e) {}
                });
              }
            }

            // Deduplicate
            candidateUrls = candidateUrls.filter(function (v, i, a) {
              return a.indexOf(v) === i;
            });

            if (!candidateUrls.length) return;

            var replacements = [];
            for (var i = 0; i < candidateUrls.length; i++) {
              var url = candidateUrls[i];
              var filename = (url.split("/").pop() || "").trim();
              if (!filename) continue;
              if (isSafeCanonicalFilename(filename)) continue;

              var ext = fileExt(filename);
              if (!ext) continue;

              var isCover = url.indexOf("/cover/") >= 0 || (collection === "posts" && url === cover) || (collection === "projects") || (collection === "albums" && url === (data.get("cover") || ""));
              var prefix = isCover ? "cover" : "img";

              // Use timestamp + short sha to keep deterministic-ish across retries.
              var now = new Date();
              var stub = timestamp14(now);

              var shortSha = "0000";
              try {
                var peek = await githubGetJson(
                  apiRoot,
                  token,
                  "/repos/" + cfg.repo + "/contents/" + encodePath("public" + url) + "?ref=" + encodeURIComponent(cfg.branch)
                );
                if (peek && peek.sha) shortSha = String(peek.sha).slice(0, 4).toLowerCase();
              } catch (_e) {}

              var newName = prefix + "-" + stub + "-" + shortSha + "." + ext;
              if (newName === filename) continue;

              var moved = await renameAssetViaGithub(apiRoot, token, cfg.repo, cfg.branch, url, newName);
              replacements.push({ from: moved.oldUrl, to: moved.newUrl });
            }

            if (!replacements.length) return;

            var updated = data;

            function applyReplaceInString(v) {
              if (typeof v !== "string") return v;
              var out = v;
              for (var r = 0; r < replacements.length; r++) {
                var from = replacements[r].from;
                var to = replacements[r].to;
                if (out.indexOf(from) >= 0) out = out.split(from).join(to);
              }
              return out;
            }

            if (collection === "posts") {
              var newCover = applyReplaceInString(cover);
              var newBody = applyReplaceInString(body);
              if (newCover !== cover) updated = updated.set("cover", newCover);
              if (newBody !== body) updated = updated.set("body", newBody);
              return updated;
            }

            if (collection === "projects") {
              var oldProj = data.get("image") || "";
              var newProj = applyReplaceInString(oldProj);
              if (newProj !== oldProj) updated = updated.set("image", newProj);
              return updated;
            }

            if (collection === "albums") {
              var oldAlbCover = data.get("cover") || "";
              var newAlbCover = applyReplaceInString(oldAlbCover);
              if (newAlbCover !== oldAlbCover) updated = updated.set("cover", newAlbCover);
              var oldPhotos = data.get("photos");
              if (oldPhotos && typeof oldPhotos.map === "function") {
                var newPhotos = oldPhotos.map(function (p) {
                  try {
                    if (!p || typeof p.get !== "function" || typeof p.set !== "function") return p;
                    var oldSrc = p.get("src") || "";
                    var newSrc = applyReplaceInString(oldSrc);
                    if (newSrc !== oldSrc) p = p.set("src", newSrc);
                    return p;
                  } catch (_e) {
                    return p;
                  }
                });
                if (newPhotos !== oldPhotos) updated = updated.set("photos", newPhotos);
              }
              return updated;
            }

            if (collection === "diary") {
              var oldImages = data.get("images");
              if (oldImages && typeof oldImages.map === "function") {
                var newImages = oldImages.map(function (it) {
                  try {
                    if (typeof it === "string") return applyReplaceInString(it);
                    if (it && typeof it.get === "function" && typeof it.set === "function") {
                      var oldUrl = it.get("image") || "";
                      var newUrl = applyReplaceInString(oldUrl);
                      if (newUrl !== oldUrl) it = it.set("image", newUrl);
                      return it;
                    }
                    return it;
                  } catch (_e) {
                    return it;
                  }
                });
                if (newImages !== oldImages) updated = updated.set("images", newImages);
              }
              return updated;
            }

            return updated;
          } catch (e) {
            // Never block saving.
            try {
              console.warn("[cms] media auto-rename skipped:", e);
            } catch (_e) {}
            return;
          } finally {
            inFlight = false;
          }
        },
      });
    } catch (_e) {
      // No-op.
    }
  });
})();
