import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(repoRoot, "..", "coursework", "NAU", "NAU");
const manifestPath = path.join(repoRoot, "assets", "data", "coursework.json");
const outputRoot = path.join(repoRoot, "coursework", "files");
const projectLinksPath = path.join(repoRoot, "scripts", "coursework-project-links.json");

const projectMarkerFiles = new Set([
  "package.json",
  "requirements.txt",
  "readme.md",
  "server.js",
]);

const excludedDirNames = new Set([
  ".git",
  ".venv",
  ".pytest_cache",
  "__pycache__",
  "api",
  "atomic-evtx",
  "node_modules",
  "venv",
  "build",
  "data",
  "dist",
  "local",
  "lectures",
  "literature",
  "prompts",
  "results",
  "videos",
  "apiquestions",
]);

const documentExtensions = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
]);

const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

const videoExtensions = new Set([
  ".mp4",
]);

const codeExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".java",
  ".sql",
  ".ps1",
  ".html",
  ".css",
  ".scss",
]);

const referenceFilePattern = new RegExp(
  [
    "syllabus",
    "rubric",
    "guidelines?",
    "schedule(?: of assignments)?",
    "anna'?s archive",
    "textbook",
    "chapter\\b",
    "edition\\b",
    "computer networking",
    "network security essentials",
    "fundamentals of database systems",
    "introduction to intelligence studies",
    "practical malware analysis",
    "gift of fire",
    "homework assignment",
  ].join("|"),
  "i"
);

const privateFilePattern = new RegExp(
  [
    "password",
    "token",
    "secret",
    "credential",
    "private[-_ ]?key",
    "server\\.key",
    "weakkey",
    "testssh",
    "zone\\.identifier",
    "\\.env",
    "keyshare",
  ].join("|"),
  "i"
);

const generatedOutputPattern = /(^~\$|answers?forquestions|apianswers|questions?\.txt$|gpt-[\w.-]+|prompt_catalog|direct_prompt|structured_reasoning_prompt)/i;
const publishNoisePathPattern = /(^|\\)(client|server|public|src|tests?)(\\|$)/i;
const codeOnlyNamePattern = /^(codex|readme|package(-lock)?|requirements|pnpm-lock|yarn-lock|composer|tsconfig|vite\.config|next\.config|\.gitignore)$/i;
const genericTitlePattern = /^(discussion|reflection|notes?|assignment|project|paper|final|report|essay|brief|screenshot\d*|ss\d*|step[\d.]*|homework[\d.-]*|lab responses?)$/i;
const maxPublicFileBytes = 25 * 1024 * 1024;
const manualExcludedPublicPaths = new Set([
  "fall-2024/cyb126/Seacord_-_Ch1_Running_with_scissors.pdf",
  "fall-2025/ccj385/Deeper Dive 3 Instructions.pdf",
  "fall-2025/ccj385/Deeper Dive Assignment 1 Fall25.pdf",
  "fall-2025/ccj385/Exam2_CCJ385_Q1_Tvandermooren.docx",
  "fall-2025/ccj385/Exam2_CCJ385_Q2_Tvandermooren.docx",
  "fall-2025/ccj385/Exam2_CCJ385_Q3_Tvandermooren.docx",
  "fall-2025/ccj385/Exam2_CCJ385_Q4_Tvandermooren.docx",
  "fall-2025/ccj385/Exam2_CCJ385_Q5_Tvandermooren.docx",
  "fall-2025/ccj385/Reflection 1 fall 2025.pdf",
  "fall-2025/ccj385/Reflection 2 fall 2025 - Google Docs.pdf",
  "fall-2025/ccj385/Reflection2_Tvandermooren_CCJ385.docx",
  "fall-2025/cyb404/Assignment2/Wireshark_Intro_v8.0-1.pdf",
  "fall-2025/egr333/1-Geremew.pdf",
  "fall-2025/egr333/EGR_333W_tjv55_coverletter.pdf",
  "fall-2025/egr333/EGR_333w_tvandermooren_tjv55_resume.pdf",
  "fall-2025/egr333/Literature Review assignment.pdf",
  "fall-2025/egr333/Privacy Paper assignment.pdf",
  "fall-2025/egr333/Resume assignment-1.pdf",
  "fall-2025/egr333/Tech Essay-1.pdf",
  "fall-2025/egr333/Video short Fall 2023.pdf",
  "fall-2025/egr333/case study/Memorandum Format.docx",
  "fall-2025/egr333/tvandermoorenResumeGeneral.pdf",
  "summer-2025/cs312/proj2/api key.docx",
  "summer-2025/cs312/proj4take2/planning.docx",
  "summer-2025/cs312/proj5/Testercodes/tester.txt",
].map((value) => value.toLowerCase()));
const publicPathOverrides = new Map([
  [
    "summer-2025/cs312/proj5/phase1/CS-312-Project-Phase-1-employeeDB_tjv55.pdf",
    "summer-2025/cs312/proj5/CS-312-Project-Phase-1-employeeDB_tjv55.pdf",
  ],
].map(([from, to]) => [from.toLowerCase(), to]));

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeSegment(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.\-() ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || "item";
}

function normalizePublicPath(value) {
  return String(value || "").split(path.sep).join("/").toLowerCase();
}

function humanize(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatLabelFromExtension(extension) {
  const ext = extension.replace(/^\./, "").toUpperCase();
  if (ext === "DOCX") return "DOCX";
  if (ext === "PPTX") return "PPTX";
  if (ext === "TXT") return "TXT";
  if (ext === "MD") return "Markdown";
  return ext;
}

function inferCourseDomain(courseName) {
  if (/^(INT|CCJ|JUS)/i.test(courseName)) {
    return { key: "intelligence", label: "Intelligence and analysis" };
  }

  if (/^CYB/i.test(courseName)) {
    return { key: "cybersecurity", label: "Cybersecurity" };
  }

  if (/^(CS|ITC)/i.test(courseName)) {
    return { key: "computing", label: "Computing and software" };
  }

  if (/^EGR/i.test(courseName)) {
    return { key: "ethics", label: "Ethics and policy" };
  }

  return { key: "general", label: "General studies" };
}

function parseSemester(name) {
  const match = String(name || "").match(/(spring|summer|fall)\s*(\d{4})/i);
  const season = match ? match[1].toLowerCase() : "term";
  const year = match ? Number(match[2]) : 0;
  const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
  return {
    key: normalizeKey(`${season}-${year}`),
    label: year ? `${seasonLabel} ${year}` : humanize(name),
    season,
    year,
  };
}

function buildCourseRecord(courseName, semesterMeta) {
  const domain = inferCourseDomain(courseName);
  return {
    key: normalizeKey(courseName),
    label: courseName,
    domain: domain.key,
    domainLabel: domain.label,
    semesterKey: semesterMeta.key,
    semesterLabel: semesterMeta.label,
    searchText: [
      courseName,
      semesterMeta.label,
      domain.label,
    ].join(" "),
    items: [],
    projects: [],
  };
}

function sortSemestersDescending(a, b) {
  const order = {
    spring: 1,
    summer: 2,
    fall: 3,
    term: 4,
  };

  if (a.year !== b.year) {
    return b.year - a.year;
  }

  return (order[b.season] || 0) - (order[a.season] || 0);
}

function isExcludedDirectory(name) {
  return excludedDirNames.has(String(name || "").toLowerCase());
}

function isPublishableExtension(extension) {
  return documentExtensions.has(extension) || imageExtensions.has(extension) || videoExtensions.has(extension);
}

function isCodeExtension(extension) {
  return codeExtensions.has(extension);
}

function isReferenceMaterial(relativePath) {
  return referenceFilePattern.test(relativePath);
}

function isPrivateMaterial(relativePath) {
  return privateFilePattern.test(relativePath);
}

function buildPublicRelativePath(semesterKey, courseKey, relativeCoursePath) {
  const parts = relativeCoursePath.split(path.sep).filter(Boolean);
  const safeParts = parts.map((part) => sanitizeSegment(part));
  return path.posix.join(semesterKey, courseKey, ...safeParts);
}

function buildPublicHref(relativePath) {
  return `./files/${relativePath.split(path.sep).join("/")}`;
}

function isManuallyExcludedPublicPath(relativePath) {
  return manualExcludedPublicPaths.has(normalizePublicPath(relativePath));
}

function resolvePublicRelativePath(relativePath) {
  const normalized = normalizePublicPath(relativePath);
  return publicPathOverrides.get(normalized) || relativePath;
}

function buildItemTitle(relativeCoursePath) {
  const parsed = path.parse(relativeCoursePath);
  const baseTitle = humanize(parsed.name);
  const directoryBits = path.dirname(relativeCoursePath).split(path.sep).filter(Boolean);
  const contextLabel = directoryBits.map((part) => humanize(part)).join(" / ");

  if (genericTitlePattern.test(baseTitle) && directoryBits.length) {
    return {
      title: `${humanize(directoryBits[directoryBits.length - 1])} / ${baseTitle}`,
      contextLabel,
    };
  }

  return {
    title: baseTitle,
    contextLabel,
  };
}

function inferItemKind(relativePath, extension) {
  const lower = relativePath.toLowerCase();

  if (imageExtensions.has(extension)) {
    return { key: "visual", label: "Visual", family: "visual" };
  }

  if (videoExtensions.has(extension)) {
    return { key: "media", label: "Media", family: "visual" };
  }

  if (/research ?brief/.test(lower)) {
    return { key: "research-brief", label: "Research brief", family: "document" };
  }

  if (/report/.test(lower)) {
    return { key: "report", label: "Report", family: "document" };
  }

  if (/discussion/.test(lower)) {
    return { key: "discussion", label: "Discussion", family: "document" };
  }

  if (/reflection/.test(lower)) {
    return { key: "reflection", label: "Reflection", family: "document" };
  }

  if (/essay|paper|brief|final/.test(lower)) {
    return { key: "paper", label: "Paper", family: "document" };
  }

  if (/presentation|slide/.test(lower) || extension === ".pptx") {
    return { key: "slides", label: "Slides", family: "document" };
  }

  if (/assignment|homework|project|lab/.test(lower)) {
    return { key: "assignment", label: "Assignment", family: "document" };
  }

  if (extension === ".md" || extension === ".txt") {
    return { key: "notes", label: "Notes", family: "document" };
  }

  return { key: "document", label: "Document", family: "document" };
}

function buildPrimaryLinkLabel(extension) {
  if (extension === ".pdf") return "Open PDF";
  if (extension === ".docx") return "Download DOCX";
  if (extension === ".pptx") return "Download slides";
  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".gif" || extension === ".webp") {
    return "Open image";
  }
  if (extension === ".mp4") return "Open video";
  if (extension === ".md" || extension === ".txt") return "Open text";
  return "Open file";
}

function digest(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function loadProjectLinks() {
  try {
    const raw = await fs.readFile(projectLinksPath, "utf8");
    const parsed = JSON.parse(raw);
    const defaults = parsed && typeof parsed.__defaults === "object" ? parsed.__defaults : {};
    const manualProjects = Array.isArray(parsed?.__manualProjects) ? parsed.__manualProjects : [];
    const entries = Object.fromEntries(
      Object.entries(parsed || {}).filter(([key]) => key !== "__defaults" && key !== "__manualProjects")
    );

    return { defaults, entries, manualProjects };
  } catch {
    return { defaults: {}, entries: {}, manualProjects: [] };
  }
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function buildGithubTreeUrl(baseUrl, repoPath) {
  const cleanBase = trimSlashes(baseUrl);
  const cleanPath = trimSlashes(String(repoPath || "").split(path.sep).join("/"));

  if (!cleanBase || !cleanPath) {
    return null;
  }

  return `${cleanBase}/${cleanPath}`;
}

async function readDirectorySafe(targetPath) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function collectFiles(directoryPath, relativePrefix = "") {
  const results = [];
  const entries = await readDirectorySafe(directoryPath);

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".gitignore") {
      continue;
    }

    if (entry.isDirectory()) {
      if (isExcludedDirectory(entry.name)) {
        continue;
      }

      const childPath = path.join(directoryPath, entry.name);
      const childPrefix = path.join(relativePrefix, entry.name);
      results.push(...await collectFiles(childPath, childPrefix));
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    const stat = await fs.stat(absolutePath);
    results.push({
      absolutePath,
      relativePath: path.join(relativePrefix, entry.name),
      name: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      size: stat.size,
    });
  }

  return results;
}

async function detectProjectDirectories(courseAbsolutePath, relativePrefix = "", depth = 0, results = []) {
  const entries = await readDirectorySafe(courseAbsolutePath);
  const visibleFiles = entries.filter((entry) => entry.isFile());
  const visibleDirectories = entries.filter((entry) => entry.isDirectory() && !isExcludedDirectory(entry.name));

  const lowerFileNames = visibleFiles.map((entry) => entry.name.toLowerCase());
  const directCodeFileCount = visibleFiles.filter((entry) => isCodeExtension(path.extname(entry.name).toLowerCase())).length;
  const hasMarker = lowerFileNames.some((name) => projectMarkerFiles.has(name));
  const hasStaticProjectShape = lowerFileNames.includes("index.html") && directCodeFileCount >= 3;
  const hasCodeCollectionShape = directCodeFileCount >= 3;

  if ((hasMarker && (directCodeFileCount > 0 || visibleDirectories.length > 0)) || hasStaticProjectShape || hasCodeCollectionShape) {
    results.push({
      absolutePath: courseAbsolutePath,
      relativePath: relativePrefix,
    });
    return results;
  }

  if (depth >= 4) {
    return results;
  }

  for (const entry of visibleDirectories) {
    const childAbsolutePath = path.join(courseAbsolutePath, entry.name);
    const childRelativePath = path.join(relativePrefix, entry.name);
    await detectProjectDirectories(childAbsolutePath, childRelativePath, depth + 1, results);
  }

  return results;
}

function extractGithubUrl(text) {
  if (!text) return null;

  const match = text.match(/https?:\/\/github\.com\/[^\s)"']+/i);
  return match ? match[0].replace(/\.git$/i, "") : null;
}

function parseReadmeSummary(text) {
  if (!text) return "";

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const summaryLines = [];

  for (const line of lines) {
    if (line.startsWith("```")) continue;
    if (/^#+\s*$/.test(line)) continue;

    const cleaned = line.replace(/^#+\s*/, "").trim();
    if (!cleaned) continue;
    if (/^[-*]\s+/.test(cleaned)) continue;
    if (cleaned.length < 12) continue;

    summaryLines.push(cleaned);

    if (summaryLines.join(" ").length >= 260) {
      break;
    }
  }

  return summaryLines.join(" ").slice(0, 260);
}

function inferProjectStack(fileNames, codeFiles) {
  const stack = new Set();
  const lowerFileNames = fileNames.map((name) => name.toLowerCase());

  if (lowerFileNames.includes("package.json")) {
    stack.add("Node.js");
  }

  if (lowerFileNames.includes("requirements.txt")) {
    stack.add("Python");
  }

  if (codeFiles.some((file) => file.extension === ".py")) {
    stack.add("Python");
  }

  if (codeFiles.some((file) => file.extension === ".sql")) {
    stack.add("SQL");
  }

  if (codeFiles.some((file) => file.extension === ".c")) {
    stack.add("C");
  }

  if (codeFiles.some((file) => file.extension === ".cpp" || file.extension === ".cc" || file.extension === ".hpp" || file.extension === ".h")) {
    stack.add("C++");
  }

  if (codeFiles.some((file) => file.extension === ".java")) {
    stack.add("Java");
  }

  if (codeFiles.some((file) => file.extension === ".html")) {
    stack.add("HTML");
  }

  if (codeFiles.some((file) => file.extension === ".css" || file.extension === ".scss")) {
    stack.add("CSS");
  }

  if (codeFiles.some((file) => file.extension === ".jsx" || file.extension === ".tsx")) {
    stack.add("React");
  }

  return Array.from(stack);
}

function summarizeLanguages(codeFiles) {
  const counts = new Map();

  for (const file of codeFiles) {
    const label = formatLabelFromExtension(file.extension);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => `${label} (${count})`);
}

function fallbackStackFromLanguages(languages) {
  const stack = new Set();

  for (const entry of languages || []) {
    const label = String(entry || "").split(" ")[0].toUpperCase();

    if (label === "PY") stack.add("Python");
    if (label === "C") stack.add("C");
    if (label === "SQL") stack.add("SQL");
    if (label === "JAVA") stack.add("Java");
    if (label === "HTML") stack.add("HTML");
    if (label === "CSS") stack.add("CSS");
    if (label === "TS") stack.add("TypeScript");
    if (label === "JS") stack.add("JavaScript");
  }

  return Array.from(stack);
}

async function buildProjects(semesterKey, courseKey, courseAbsolutePath, projectLinks) {
  const candidateDirectories = await detectProjectDirectories(courseAbsolutePath);
  const projects = [];

  for (const candidate of candidateDirectories) {
    const projectAbsolutePath = candidate.absolutePath;
    const projectRelativePath = candidate.relativePath || ".";
    const files = await collectFiles(projectAbsolutePath, "");
    const fileNames = files.map((file) => file.name);
    const codeFiles = files.filter((file) => isCodeExtension(file.extension));

    if (!codeFiles.length) {
      continue;
    }

    let readmeText = "";

    try {
      readmeText = await fs.readFile(path.join(projectAbsolutePath, "README.md"), "utf8");
    } catch {
      readmeText = "";
    }

    const key = `${semesterKey}/${courseKey}/${projectRelativePath.split(path.sep).join("/")}`;
    const linkConfig = projectLinks.entries[key];
    const sourceRelativePath = path.relative(sourceRoot, projectAbsolutePath).split(path.sep).join("/");
    const githubUrl =
      extractGithubUrl(readmeText) ||
      linkConfig?.githubUrl ||
      buildGithubTreeUrl(projectLinks.defaults?.githubBaseUrl, linkConfig?.repoPath || sourceRelativePath) ||
      null;
    const languages = summarizeLanguages(codeFiles);
    const inferredStack = inferProjectStack(fileNames, codeFiles);
    const stack = inferredStack.length ? inferredStack : fallbackStackFromLanguages(languages);

    projects.push({
      id: digest(key),
      title: humanize(path.basename(projectAbsolutePath)),
      relPath: projectRelativePath.split(path.sep).join("/"),
      summary: linkConfig?.summary || parseReadmeSummary(readmeText) || "Code project discovered in the coursework tree.",
      githubUrl,
      githubLabel: githubUrl ? "Open GitHub" : "GitHub link pending",
      stack,
      languages,
      searchText: [
        humanize(path.basename(projectAbsolutePath)),
        projectRelativePath,
        parseReadmeSummary(readmeText),
        stack.join(" "),
        languages.join(" "),
      ].join(" "),
    });
  }

  return projects.sort((a, b) => a.title.localeCompare(b.title));
}

async function copyPublicFile(fileRecord) {
  const destinationAbsolutePath = path.join(outputRoot, fileRecord.publicRelativePath);
  await ensureDirectory(path.dirname(destinationAbsolutePath));
  await fs.copyFile(fileRecord.absolutePath, destinationAbsolutePath);
}

async function buildCourseItems(semesterKey, courseKey, courseAbsolutePath, domainLabel, stats) {
  const files = await collectFiles(courseAbsolutePath);
  const groupedDocuments = new Map();
  const standaloneItems = [];

  for (const file of files) {
    const relativePathLower = file.relativePath.toLowerCase();

    if (isPrivateMaterial(relativePathLower)) {
      stats.excludedFileCount += 1;
      continue;
    }

    if (isReferenceMaterial(relativePathLower)) {
      stats.excludedFileCount += 1;
      continue;
    }

    if (generatedOutputPattern.test(file.name)) {
      stats.excludedFileCount += 1;
      continue;
    }

    if (publishNoisePathPattern.test(file.relativePath)) {
      stats.excludedFileCount += 1;
      continue;
    }

    if (codeOnlyNamePattern.test(path.parse(file.name).name) || codeOnlyNamePattern.test(file.name)) {
      stats.excludedFileCount += 1;
      continue;
    }

    if (!isPublishableExtension(file.extension)) {
      stats.excludedFileCount += 1;
      continue;
    }

    if (file.size > maxPublicFileBytes) {
      stats.excludedFileCount += 1;
      continue;
    }

    const rawPublicRelativePath = buildPublicRelativePath(semesterKey, courseKey, file.relativePath);
    if (isManuallyExcludedPublicPath(rawPublicRelativePath)) {
      stats.excludedFileCount += 1;
      continue;
    }

    const publicRelativePath = resolvePublicRelativePath(rawPublicRelativePath);
    const href = buildPublicHref(publicRelativePath);
    const titleBits = buildItemTitle(file.relativePath);
    const kind = inferItemKind(file.relativePath, file.extension);
    const record = {
      id: digest(`${semesterKey}/${courseKey}/${file.relativePath}`),
      title: titleBits.title || humanize(path.parse(file.name).name),
      kind: kind.key,
      kindLabel: kind.label,
      family: kind.family,
      format: file.extension.replace(/^\./, ""),
      formatLabel: formatLabelFromExtension(file.extension),
      href,
      primaryLinkLabel: buildPrimaryLinkLabel(file.extension),
      sourceRelativePath: file.relativePath.split(path.sep).join(" / "),
      contextLabel: titleBits.contextLabel,
      tags: [domainLabel],
      searchText: [
        titleBits.title,
        titleBits.contextLabel,
        file.relativePath,
        domainLabel,
      ].join(" "),
      absolutePath: file.absolutePath,
      publicRelativePath,
      extension: file.extension,
    };

    if (documentExtensions.has(file.extension)) {
      const groupKey = `${path.dirname(file.relativePath).toLowerCase()}::${normalizeKey(path.parse(file.name).name)}`;
      const currentGroup = groupedDocuments.get(groupKey) || [];
      currentGroup.push(record);
      groupedDocuments.set(groupKey, currentGroup);
    } else {
      standaloneItems.push(record);
    }
  }

  const documentPreference = [".pdf", ".md", ".txt", ".docx", ".pptx"];
  const items = [];
  const copyTargets = new Map();

  for (const groupRecords of groupedDocuments.values()) {
    groupRecords.sort((a, b) => documentPreference.indexOf(a.extension) - documentPreference.indexOf(b.extension));
    const primary = groupRecords[0];

    items.push({
      ...primary,
      secondaryLinks: groupRecords.slice(1).map((record) => ({
        label: buildPrimaryLinkLabel(record.extension),
        href: record.href,
      })),
    });

    groupRecords.forEach((record) => {
      copyTargets.set(record.id, record);
    });
  }

  standaloneItems.forEach((item) => {
    items.push(item);
    copyTargets.set(item.id, item);
  });

  for (const record of copyTargets.values()) {
    await copyPublicFile(record);
  }

  stats.publishedFileCount += copyTargets.size;

  return items
    .map((item) => {
      const { absolutePath, publicRelativePath, extension, ...cleanItem } = item;
      return cleanItem;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function buildManifest() {
  await ensureDirectory(path.dirname(manifestPath));
  await fs.rm(outputRoot, { recursive: true, force: true });
  await ensureDirectory(outputRoot);

  const projectLinks = await loadProjectLinks();
  const semesterEntries = await readDirectorySafe(sourceRoot);
  const semesters = [];
  const stats = {
    semesterCount: 0,
    courseCount: 0,
    itemCount: 0,
    projectCount: 0,
    publishedFileCount: 0,
    excludedFileCount: 0,
  };

  for (const semesterEntry of semesterEntries.filter((entry) => entry.isDirectory())) {
    const semesterMeta = parseSemester(semesterEntry.name);
    const semesterAbsolutePath = path.join(sourceRoot, semesterEntry.name);
    const courseEntries = await readDirectorySafe(semesterAbsolutePath);
    const courses = [];

    for (const courseEntry of courseEntries.filter((entry) => entry.isDirectory())) {
      if (courseEntry.name.toLowerCase().includes("syllab")) {
        continue;
      }

      const courseAbsolutePath = path.join(semesterAbsolutePath, courseEntry.name);
      const courseKey = normalizeKey(courseEntry.name);
      const domain = inferCourseDomain(courseEntry.name);
      const courseItems = await buildCourseItems(semesterMeta.key, courseKey, courseAbsolutePath, domain.label, stats);
      const courseProjects = await buildProjects(semesterMeta.key, courseKey, courseAbsolutePath, projectLinks);

      if (!courseItems.length && !courseProjects.length) {
        continue;
      }

      courses.push({
        key: courseKey,
        label: courseEntry.name,
        domain: domain.key,
        domainLabel: domain.label,
        semesterKey: semesterMeta.key,
        semesterLabel: semesterMeta.label,
        searchText: [
          courseEntry.name,
          semesterMeta.label,
          domain.label,
        ].join(" "),
        items: courseItems,
        projects: courseProjects,
      });

      stats.courseCount += 1;
      stats.itemCount += courseItems.length;
      stats.projectCount += courseProjects.length;
    }

    if (!courses.length) {
      continue;
    }

    semesters.push({
      ...semesterMeta,
      courses: courses.sort((a, b) => a.label.localeCompare(b.label)),
    });
  }

  for (const manualProject of projectLinks.manualProjects || []) {
    const semesterMeta = parseSemester(manualProject.semesterName);
    let semesterRecord = semesters.find((semester) => semester.key === semesterMeta.key);

    if (!semesterRecord) {
      semesterRecord = {
        ...semesterMeta,
        courses: [],
      };
      semesters.push(semesterRecord);
    }

    let courseRecord = semesterRecord.courses.find(
      (course) => course.key === normalizeKey(manualProject.courseName)
    );

    if (!courseRecord) {
      courseRecord = buildCourseRecord(manualProject.courseName, semesterMeta);
      semesterRecord.courses.push(courseRecord);
      stats.courseCount += 1;
    }

    const relPath = manualProject.relPath || ".";
    const githubUrl =
      manualProject.githubUrl ||
      buildGithubTreeUrl(projectLinks.defaults?.githubBaseUrl, manualProject.repoPath) ||
      null;

    courseRecord.projects.push({
      id: digest([
        semesterRecord.key,
        courseRecord.key,
        relPath,
        manualProject.title,
      ].join("/")),
      title: manualProject.title || humanize(relPath),
      relPath,
      summary: manualProject.summary || "Manual project entry.",
      githubUrl,
      githubLabel: githubUrl ? "Open GitHub" : "GitHub link pending",
      stack: Array.isArray(manualProject.stack) ? manualProject.stack : [],
      languages: Array.isArray(manualProject.languages) ? manualProject.languages : [],
      searchText: [
        manualProject.title || relPath,
        courseRecord.label,
        semesterRecord.label,
        manualProject.summary || "",
        Array.isArray(manualProject.stack) ? manualProject.stack.join(" ") : "",
        Array.isArray(manualProject.languages) ? manualProject.languages.join(" ") : "",
      ].join(" "),
    });

    courseRecord.projects.sort((a, b) => a.title.localeCompare(b.title));
    stats.projectCount += 1;
  }

  semesters.forEach((semester) => {
    semester.courses.sort((a, b) => a.label.localeCompare(b.label));
  });

  semesters.sort(sortSemestersDescending);
  stats.semesterCount = semesters.length;

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    stats,
    semesters,
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Coursework archive generated at ${manifestPath}`);
  console.log(`Published files: ${stats.publishedFileCount}`);
  console.log(`Excluded files: ${stats.excludedFileCount}`);
  console.log(`Courses: ${stats.courseCount}`);
  console.log(`Code projects: ${stats.projectCount}`);
}

buildManifest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
