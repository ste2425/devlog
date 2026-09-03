const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { marked } = require('marked');

const rootDir = __dirname;
const sourceDir = path.join(rootDir, 'source');
const postsDir = path.join(sourceDir, 'posts');
const imagesDir = path.join(sourceDir, 'images');
const videosDir = path.join(sourceDir, 'videos');
const publicDir = path.join(rootDir, 'public');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

const watchMode = process.argv.includes('--watch');
const siteTitle = 'Devlog';
const siteUrl = 'https://ste2425.github.io/devlog';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(value) {
  const entities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
    '#39': "'",
  };

  return String(value || '').replace(/&(#39|amp|apos|gt|lt|quot);/g, (entity, name) => entities[name]);
}

function normalizeScalar(value) {
  if (!value) return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  return trimmed;
}

function parseFrontMatter(content) {
  const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!frontMatterMatch) {
    return { frontMatter: {}, body: content };
  }

  const frontMatterText = frontMatterMatch[1];
  const body = frontMatterMatch[2] || '';
  const frontMatter = {};
  const lines = frontMatterText.split(/\r?\n/);
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const listMatch = trimmedLine.match(/^\-\s*(.*)$/);
    if (listMatch) {
      if (!currentKey) {
        continue;
      }
      if (!Array.isArray(frontMatter[currentKey])) {
        frontMatter[currentKey] = [];
      }
      frontMatter[currentKey].push(normalizeScalar(listMatch[1]));
      continue;
    }

    const keyValueMatch = trimmedLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      currentKey = key;
      if (value === '') {
        frontMatter[key] = [];
      } else {
        frontMatter[key] = normalizeScalar(value);
        currentKey = null;
      }
      continue;
    }

    if (currentKey && !Array.isArray(frontMatter[currentKey])) {
      frontMatter[currentKey] = [frontMatter[currentKey], normalizeScalar(trimmedLine)].filter((part) => part !== undefined && part !== '');
    }
  }

  return { frontMatter, body };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getProjectName(frontMatter) {
  if (frontMatter.project) {
    return frontMatter.project;
  }

  if (frontMatter.categories) {
    const categories = Array.isArray(frontMatter.categories) ? frontMatter.categories : [frontMatter.categories];
    const filtered = categories.filter((item) => item && item !== 'Projects');
    if (filtered.length > 0) {
      return filtered[0];
    }
  }

  return 'General';
}

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...readMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(fullPath);
    }
  }

  return result;
}

function markdownToHtml(body) {
  return marked.parse(body || '', { breaks: true, gfm: true });
}

function getExcerpt(body, fallback = 'Read more') {
  const text = decodeHtmlEntities(stripHtml(marked.parse(body || ''))).replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function wrapText(value, maxCharacters) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && nextLine.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function createSocialImage({ title, project, excerpt, targetPath }) {
  const titleLines = wrapText(title, 32).slice(0, 2);
  const excerptLines = wrapText(excerpt, 68).slice(0, 3);
  const titleMarkup = titleLines
    .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : 68}">${escapeXml(line)}</tspan>`)
    .join('');
  const excerptMarkup = excerptLines
    .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#0d1117"/>
    <rect x="48" y="48" width="1104" height="534" rx="18" fill="#111827" stroke="#334155" stroke-width="2"/>
    <rect x="48" y="48" width="12" height="534" rx="6" fill="#d7a6ff"/>
    <text x="96" y="126" fill="#d7a6ff" font-family="sans-serif" font-size="26" font-weight="700" letter-spacing="3">${escapeXml(project).toUpperCase()}</text>
    <text x="96" y="230" fill="#e5e7eb" font-family="sans-serif" font-size="58" font-weight="700">${titleMarkup}</text>
    <text x="96" y="390" fill="#9aa4b2" font-family="sans-serif" font-size="27">${excerptMarkup}</text>
    <text x="96" y="530" fill="#f0b8ff" font-family="sans-serif" font-size="25" font-weight="700">${siteTitle}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toFile(targetPath);
}

function rootRelativePrefix(pagePath) {
  return pagePath === 'index.html' ? '' : '../';
}

function isRootPage(pagePath) {
  return pagePath === 'index.html' || pagePath === 'projects.html';
}

function rewriteMediaUrls(html, pagePath) {
  const prefix = rootRelativePrefix(pagePath);
  const result = String(html).replace(/(src|href)=["']\/(images|videos)\/([^"']+)["']/g, (_, attr, type, file) => `${attr}="${prefix}${type}/${file}"`);
  return result.replace(/(src|href)=["'](images|videos)\/([^"']+)["']/g, (_, attr, type, file) => `${attr}="${prefix}${type}/${file}"`);
}

function renderLayout({ title, body, pagePath, projectLinks, cssHref, description, canonicalUrl, socialImageUrl, ogType = 'article' }) {
  const rootHref = isRootPage(pagePath) ? './' : '../';
  const projectList = projectLinks
    .map((project) => {
      const href = isRootPage(pagePath)
        ? `projects/${slugify(project)}.html`
        : `../projects/${slugify(project)}.html`;
      return `<li><a href="${href}">${escapeHtml(project)}</a></li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | ${siteTitle}</title>
    <meta name="description" content="${escapeHtml(description || 'A minimal developer log and project journal.')}" />
    ${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />` : ''}
    ${canonicalUrl ? `<meta property="og:type" content="${escapeHtml(ogType)}" />\n    <meta property="og:title" content="${escapeHtml(title)} | ${siteTitle}" />\n    <meta property="og:description" content="${escapeHtml(description || '')}" />\n    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />\n    <meta property="og:site_name" content="${siteTitle}" />` : ''}
    ${socialImageUrl ? `<meta property="og:image" content="${escapeHtml(socialImageUrl)}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta name="twitter:card" content="summary_large_image" />\n    <meta name="twitter:title" content="${escapeHtml(title)} | ${siteTitle}" />\n    <meta name="twitter:description" content="${escapeHtml(description || '')}" />\n    <meta name="twitter:image" content="${escapeHtml(socialImageUrl)}" />` : ''}
    <link rel="stylesheet" href="${cssHref}" />
  </head>
  <body>
    <header class="site-header">
      <div class="container nav-wrap">
        <a class="brand" href="${rootHref}">${siteTitle}</a>
        <nav class="site-nav" aria-label="Main navigation">
          <a href="${rootHref}">Home</a>
          <a href="${rootHref}projects.html">Projects</a>
        </nav>
      </div>
    </header>

    <main class="container main-content">
      ${body}
    </main>

    <aside class="container sidebar">
      <div class="panel">
        <h2>Projects</h2>
        <ul class="project-list">${projectList || '<li>General</li>'}</ul>
      </div>
    </aside>

    <footer class="site-footer">
      <div class="container">
        <p>Built with Markdown and Node.js.</p>
      </div>
    </footer>

    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const overlay = document.createElement('div');
        overlay.className = 'media-lightbox';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = '<button class="media-lightbox-close" type="button" aria-label="Close image view">×</button><img alt="" />';
        document.body.appendChild(overlay);

        const overlayImg = overlay.querySelector('img');
        const closeButton = overlay.querySelector('button');

        const closeLightbox = () => {
          overlay.classList.remove('is-open');
          overlay.setAttribute('aria-hidden', 'true');
          document.body.classList.remove('lightbox-open');
        };

        closeButton.addEventListener('click', closeLightbox);
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) {
            closeLightbox();
          }
        });

        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
            closeLightbox();
          }
        });

        document.querySelectorAll('.article-body img').forEach((img) => {
          img.classList.add('lightbox-trigger');
          img.addEventListener('click', () => {
            overlayImg.src = img.currentSrc || img.src;
            overlayImg.alt = img.alt || '';
            overlay.classList.add('is-open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('lightbox-open');
          });
        });
      });
    </script>
  </body>
</html>`;
}

function renderHomePage(posts, cssHref) {
  const projectLinks = [...new Set(posts.map((post) => post.project))];
  const canonicalUrl = `${siteUrl}/`;
  const socialImageUrl = `${siteUrl}/social/home.png`;
  const postCards = posts
    .map((post) => {
      const projectHref = `projects/${slugify(post.project)}.html`;
      const articleHref = `posts/${post.slug}.html`;
      return `
        <article class="post-card">
          <div class="meta-row">
            <span class="project-tag">${escapeHtml(post.project)}</span>
            <time>${post.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
          </div>
          <h2><a href="${articleHref}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.excerpt)}</p>
          <a class="read-more" href="${articleHref}">Read the post</a>
        </article>`;
    })
    .join('');

  const body = `
    <section class="intro">
      <p class="eyebrow">Latest work</p>
      <h1>Developer log</h1>
      <p>Notes, experiments, and project updates.</p>
    </section>
    <section class="post-list">${postCards}</section>
  `;

  return renderLayout({
    title: 'Home',
    body,
    pagePath: 'index.html',
    projectLinks,
    cssHref,
    description: 'Notes, experiments, and project updates from Devlog.',
    canonicalUrl,
    socialImageUrl,
    ogType: 'website',
  });
}

function renderProjectPage(projectName, posts, cssHref) {
  const projectLinks = [...new Set(posts.map((post) => post.project))];
  const itemMarkup = posts
    .map((post) => `
      <li>
        <a href="../posts/${post.slug}.html">${escapeHtml(post.title)}</a>
        <time>${post.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
      </li>
    `)
    .join('');

  const body = `
    <article class="project-page">
      <p class="eyebrow">Project</p>
      <h1>${escapeHtml(projectName)}</h1>
      <ul class="project-post-list">${itemMarkup}</ul>
    </article>
  `;

  return renderLayout({ title: projectName, body, pagePath: `projects/${slugify(projectName)}.html`, projectLinks, cssHref });
}

function renderPostPage(post, projectLinks, cssHref) {
  const pagePath = `posts/${post.slug}.html`;
  const canonicalUrl = `${siteUrl}/${pagePath}`;
  const socialImageUrl = `${siteUrl}/social/${post.slug}.png`;
  const projectHref = `../projects/${slugify(post.project)}.html`;
  const body = `
    <article class="post-article">
      <header class="article-header">
        <a class="eyebrow project-link" href="${projectHref}">${escapeHtml(post.project)}</a>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="meta-row article-meta">
          <time>${post.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
        </div>
      </header>
      <div class="article-body">
        ${rewriteMediaUrls(markdownToHtml(post.body), 'posts/' + post.slug + '.html')}
      </div>
    </article>
  `;

  return renderLayout({ title: post.title, body, pagePath, projectLinks, cssHref, description: post.excerpt, canonicalUrl, socialImageUrl });
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }

  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      sanitizeImageFile(sourcePath, targetPath);
    } else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      sanitizeVideoFile(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function sanitizeImageFile(sourcePath, targetPath) {
  return sharp(sourcePath)
    .rotate()
    .toFile(targetPath)
    .catch((error) => {
      throw new Error(`Failed to sanitize image metadata for ${sourcePath}: ${error.message}`);
    });
}

function sanitizeVideoFile(sourcePath, targetPath) {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static is required to sanitize video metadata but is not available.');
  }

  ensureDir(path.dirname(targetPath));
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  execFileSync(ffmpegPath, [
    '-y',
    '-i', sourcePath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    targetPath,
  ], { stdio: 'inherit' });
}

function validateImageSanitization(filePath) {
  return sharp(filePath)
    .metadata()
    .then((metadata) => {
      const sensitiveKeys = ['exif', 'icc', 'iptc', 'xmp'];
      const presentSensitiveKeys = sensitiveKeys.filter((key) => metadata[key] !== undefined && metadata[key] !== null);
      if (presentSensitiveKeys.length > 0) {
        throw new Error(`Image metadata still present in ${filePath}: ${presentSensitiveKeys.join(', ')}`);
      }
    })
    .catch((error) => {
      if (error && error.message && error.message.includes('Image metadata still present')) {
        throw error;
      }
      throw new Error(`Failed to validate sanitized image metadata for ${filePath}: ${error.message}`);
    });
}

function validateVideoSanitization(filePath) {
  if (!ffprobePath) {
    throw new Error('ffprobe-static is required to validate video metadata but is not available.');
  }

  const json = execFileSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format_tags:stream_tags',
    '-of', 'json',
    filePath,
  ], { encoding: 'utf8' });

  const data = JSON.parse(json || '{}');
  const allTags = {
    ...(data.format && data.format.tags ? data.format.tags : {}),
    ...(data.streams || []).reduce((acc, stream) => ({ ...acc, ...(stream.tags || {}) }), {}),
  };

  const sensitiveTagNames = Object.keys(allTags).filter((key) => {
    const normalised = key.toLowerCase();
    return normalised.includes('gps')
      || normalised.includes('location')
      || normalised.includes('make')
      || normalised.includes('model')
      || normalised.includes('device')
      || normalised.includes('camera');
  });

  if (sensitiveTagNames.length > 0) {
    throw new Error(`Video metadata still present in ${filePath}: ${sensitiveTagNames.join(', ')}`);
  }
}

function listFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function hashContent(content) {
  let hash = 2166136261;
  for (let i = 0; i < content.length; i += 1) {
    const code = content.charCodeAt(i);
    hash ^= code;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function buildSite() {
  fs.rmSync(publicDir, { recursive: true, force: true });
  ensureDir(publicDir);
  ensureDir(path.join(publicDir, 'posts'));
  ensureDir(path.join(publicDir, 'projects'));
  ensureDir(path.join(publicDir, 'social'));

  copyDirectory(imagesDir, path.join(publicDir, 'images'));
  copyDirectory(videosDir, path.join(publicDir, 'videos'));

  for (const imageFile of listFiles(path.join(publicDir, 'images'))) {
    validateImageSanitization(imageFile);
  }

  for (const videoFile of listFiles(path.join(publicDir, 'videos'))) {
    validateVideoSanitization(videoFile);
  }

  const cssSource = fs.existsSync(path.join(rootDir, 'static', 'styles-dark.css'))
    ? path.join(rootDir, 'static', 'styles-dark.css')
    : fs.existsSync(path.join(rootDir, 'static', 'styles.css'))
      ? path.join(rootDir, 'static', 'styles.css')
      : path.join(rootDir, 'styles.css');
  const cssContent = fs.readFileSync(cssSource, 'utf8');
  const cssHash = hashContent(cssContent);
  const cssFileName = `styles.${cssHash}.css`;
  copyFileIfExists(cssSource, path.join(publicDir, cssFileName));

  const files = readMarkdownFiles(postsDir);
  const posts = files
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontMatter, body } = parseFrontMatter(content);
      const title = frontMatter.title || path.basename(filePath, '.md');
      const project = getProjectName(frontMatter);
      const date = parseDate(frontMatter.date) || new Date(fs.statSync(filePath).mtimeMs);
      const slug = slugify(frontMatter.slug || title);

      return {
        title,
        slug,
        project,
        date,
        excerpt: frontMatter.summary || getExcerpt(body),
        body,
        sourcePath: filePath,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const projectLinks = [...new Set(posts.map((post) => post.project))];
  const cssHref = `styles.${cssHash}.css`;

  const homeHtml = renderHomePage(posts, cssHref);
  await createSocialImage({
    title: 'Developer log',
    project: 'Latest work',
    excerpt: 'Notes, experiments, and project updates.',
    targetPath: path.join(publicDir, 'social', 'home.png'),
  });
  fs.writeFileSync(path.join(publicDir, 'index.html'), homeHtml, 'utf8');

  const projectMap = new Map();
  for (const post of posts) {
    if (!projectMap.has(post.project)) {
      projectMap.set(post.project, []);
    }
    projectMap.get(post.project).push(post);
  }

  for (const [projectName, projectPosts] of projectMap.entries()) {
    const fileName = `${slugify(projectName)}.html`;
    const projectHtml = renderProjectPage(projectName, projectPosts, `../${cssHref}`);
    fs.writeFileSync(path.join(publicDir, 'projects', fileName), projectHtml, 'utf8');
  }

  const projectIndexHtml = renderLayout({
    title: 'Projects',
    body: `
      <section class="intro">
        <p class="eyebrow">Browse</p>
        <h1>Projects</h1>
      </section>
      <ul class="project-list-grid">
        ${[...projectMap.keys()].map((projectName) => `
          <li><a href="projects/${slugify(projectName)}.html">${escapeHtml(projectName)}</a></li>
        `).join('')}
      </ul>
    `,
    pagePath: 'projects.html',
    projectLinks,
    cssHref,
  });
  fs.writeFileSync(path.join(publicDir, 'projects.html'), projectIndexHtml, 'utf8');

  for (const post of posts) {
    const pagePath = `posts/${post.slug}.html`;
    await createSocialImage({
      title: post.title,
      project: post.project,
      excerpt: post.excerpt,
      targetPath: path.join(publicDir, 'social', `${post.slug}.png`),
    });
    const postPageHtml = renderPostPage(post, projectLinks, `../${cssHref}`);
    fs.writeFileSync(path.join(publicDir, pagePath), postPageHtml, 'utf8');
  }

  console.log(`Built ${posts.length} posts to ${publicDir}`);
}

function copyFileIfExists(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function watchForChanges() {
  buildSite();
  fs.watch(sourceDir, { recursive: true }, () => {
    buildSite();
  });
}

if (watchMode) {
  watchForChanges();
} else {
  buildSite();
}
