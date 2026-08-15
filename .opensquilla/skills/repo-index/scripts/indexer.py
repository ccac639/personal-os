#!/usr/bin/env python3
"""repo-index: lightweight incremental code indexer for OpenSquilla.

Pure standard library. Builds compact JSON indexes (files/symbols/imports/api/
impact) so an agent can locate code by symbol/file/api/impact without scanning
the whole repository every time.

Usage:
  python indexer.py build --root <project> [--languages py,ts,js,go,rs,all]
  python indexer.py update --root <project>
  python indexer.py query --root <project> --symbol <name>
  python indexer.py query --root <project> --file <path>
  python indexer.py query --root <project> --api <pattern>
  python indexer.py query --root <project> --fuzzy <keyword>
  python indexer.py impact --root <project> --file <path>
  python indexer.py meta --root <project>
"""

import argparse
import fnmatch
import hashlib
import json
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

INDEX_DIR = ".opensquilla/index"
DEFAULT_EXCLUDES = {
    ".git", "node_modules", ".venv", "venv", "env", "__pycache__",
    "build", "dist", "target", ".next", ".nuxt", ".output", "coverage", ".cache",
    ".idea", ".vscode", ".opensquilla", ".fetch", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".tox", "vendor", ".terraform",
}

# Language detection by extension
LANG_EXT = {
    "py": "python", "pyw": "python",
    "ts": "typescript", "tsx": "typescript", "js": "javascript", "jsx": "javascript", "mjs": "javascript", "cjs": "javascript",
    "go": "go",
    "rs": "rust",
    "java": "java", "kt": "kotlin",
    "rb": "ruby",
    "php": "php",
    "cs": "csharp",
    "c": "c", "h": "c", "cpp": "cpp", "cc": "cpp", "hpp": "cpp",
    "swift": "swift",
    "sql": "sql",
    "vue": "vue", "svelte": "svelte",
    "json": "json", "yaml": "yaml", "yml": "yaml", "toml": "toml", "xml": "xml",
    "md": "markdown", "rst": "markdown", "txt": "text",
    "sh": "shell", "bat": "shell", "ps1": "shell",
    "html": "html", "css": "css", "scss": "css",
}

# Symbol extraction patterns per language
SYMBOL_PATTERNS = {
    "python": [
        (r"^class\s+(\w+)", "class"),
        (r"^def\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^    def\s+(\w+)\s*\(([^)]*)\)", "method"),
        (r"^async def\s+(\w+)\s*\(([^)]*)\)", "function"),
    ],
    "typescript": [
        (r"^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)", "class"),
        (r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=]*)\s*=>", "function"),
        (r"^(?:export\s+)?interface\s+(\w+)", "interface"),
        (r"^(?:export\s+)?type\s+(\w+)\s*=", "type"),
        (r"^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]", "method"),
    ],
    "javascript": [
        (r"^(?:export\s+)?(?:default\s+)?class\s+(\w+)", "class"),
        (r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=]*)\s*=>", "function"),
        (r"^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{", "method"),
    ],
    "go": [
        (r"^type\s+(\w+)\s+struct", "struct"),
        (r"^type\s+(\w+)\s+interface", "interface"),
        (r"^func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)", "function"),
    ],
    "rust": [
        (r"^pub\s+(?:struct|enum|trait)\s+(\w+)", "type"),
        (r"^pub\s+fn\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^fn\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^pub\s+fn\s+(\w+)", "function"),
    ],
    "java": [
        (r"^\s*(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)", "class"),
        (r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:[\w<>,\[\]\.]+\s+)+(\w+)\s*\(([^)]*)\)\s*\{", "method"),
        (r"^\s*(?:public|private|protected)?\s*interface\s+(\w+)", "interface"),
    ],
    "kotlin": [
        (r"^(?:data\s+|sealed\s+|enum\s+)?class\s+(\w+)", "class"),
        (r"^fun\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^interface\s+(\w+)", "interface"),
    ],
    "ruby": [
        (r"^class\s+(\w+)", "class"),
        (r"^module\s+(\w+)", "module"),
        (r"^def\s+(\w+)", "function"),
    ],
    "php": [
        (r"^(?:abstract\s+)?class\s+(\w+)", "class"),
        (r"^\s*(?:public|private|protected)?\s*function\s+(\w+)\s*\(([^)]*)\)", "method"),
        (r"^interface\s+(\w+)", "interface"),
    ],
    "csharp": [
        (r"^\s*(?:public|private|protected|internal)?\s*(?:abstract\s+|sealed\s+|static\s+)?class\s+(\w+)", "class"),
        (r"^\s*(?:public|private|protected|internal)?\s*(?:static\s+|async\s+)?[\w<>,\[\]\.]+\s+(\w+)\s*\(([^)]*)\)", "method"),
        (r"^\s*(?:public|private|protected|internal)?\s*interface\s+(\w+)", "interface"),
    ],
    "c": [
        (r"^[\w\*]+\s+(\w+)\s*\(([^)]*)\)\s*\{", "function"),
    ],
    "cpp": [
        (r"^class\s+(\w+)", "class"),
        (r"^[\w:<>,&\*~]+\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?\{", "function"),
    ],
    "swift": [
        (r"^(?:public|private|internal|fileprivate)?\s*(?:final\s+)?class\s+(\w+)", "class"),
        (r"^(?:public|private|internal|fileprivate)?\s*func\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"^(?:public|private|internal|fileprivate)?\s*(?:struct|enum|protocol)\s+(\w+)", "type"),
    ],
}

# Import patterns per language
IMPORT_PATTERNS = {
    "python": [r"^\s*(?:from\s+([\w\.]+)\s+import|import\s+([\w\.]+))"],
    "typescript": [r"^\s*import\s+[^'\"]*?from\s+['\"]([^'\"]+)['\"]", r"^\s*import\s+['\"]([^'\"]+)['\"]", r"^\s*require\s*\(\s*['\"]([^'\"]+)['\"]"],
    "javascript": [r"^\s*import\s+[^'\"]*?from\s+['\"]([^'\"]+)['\"]", r"^\s*import\s+['\"]([^'\"]+)['\"]", r"^\s*require\s*\(\s*['\"]([^'\"]+)['\"]"],
    "go": [r"^\s*\"([\w\./\-]+)\"", r"^\s*([\w\./\-]+)\s*$"],
    "rust": [r"^\s*use\s+([\w:]+)"],
    "java": [r"^\s*import\s+([\w\.]+)"],
    "kotlin": [r"^\s*import\s+([\w\.]+)"],
    "ruby": [r"^\s*require\s+['\"]([^'\"]+)['\"]", r"^\s*require_relative\s+['\"]([^'\"]+)['\"]"],
    "php": [r"^\s*use\s+([\w\\]+)"],
    "csharp": [r"^\s*using\s+([\w\.]+)"],
    "c": [r"^\s*#include\s*[<\"]([^>\"]+)[>\"]"],
    "cpp": [r"^\s*#include\s*[<\"]([^>\"]+)[>\"]"],
    "swift": [r"^\s*import\s+(\w+)"],
}

# API route patterns (common frameworks)
API_PATTERNS = [
    (r"@(?:app|router)\.(get|post|put|delete|patch)\(['\"]([^'\"]+)['\"]", "flask/express"),
    (r"@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", "fastapi"),
    (r"@\w+\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", "generic"),
    (r"router\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", "express-router"),
    (r"(?:@app|@router)\.route\(['\"]([^'\"]+)['\"]", "flask"),
]

def log(msg):
    print(f"[repo-index] {msg}", file=sys.stderr)

def load_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else {}

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    tmp.replace(path)

def git_changed_files(root):
    """Return set of changed (added/modified/deleted) files via git if available."""
    try:
        import subprocess
        out = subprocess.run(
            ["git", "diff", "--name-only", "HEAD", "--", "."],
            cwd=root, capture_output=True, text=True, timeout=30,
        ).stdout
        out += subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=root, capture_output=True, text=True, timeout=30,
        ).stdout
        return {ln.strip().replace("\\", "/") for ln in out.splitlines() if ln.strip()}
    except Exception:
        return set()

def is_excluded(rel_path, extra_excludes=None):
    parts = set(rel_path.split("/"))
    if parts & DEFAULT_EXCLUDES:
        return True
    if extra_excludes:
        for pat in extra_excludes:
            if fnmatch.fnmatch(rel_path, pat) or fnmatch.fnmatch(rel_path, pat + "/**"):
                return True
    return False

def file_lang(path):
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return LANG_EXT.get(ext)

def file_hash(path, chunk=65536):
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            while True:
                data = f.read(chunk)
                if not data:
                    break
                h.update(data)
        return h.hexdigest()[:16]
    except OSError:
        return ""

def extract_symbols(text, lang):
    """Return list of (kind, name, signature, line)."""
    syms = []
    patterns = SYMBOL_PATTERNS.get(lang, [])
    for i, line in enumerate(text.splitlines(), 1):
        for pat, kind in patterns:
            m = re.match(pat, line)
            if m:
                name = m.group(1)
                args = m.group(2) if m.lastindex and m.lastindex >= 2 else ""
                syms.append({"kind": kind, "name": name, "signature": f"{name}({args.strip()})", "line": i})
                break
    return syms

def extract_imports(text, lang):
    """Return list of import target strings (normalized)."""
    targets = []
    patterns = IMPORT_PATTERNS.get(lang, [])
    for line in text.splitlines():
        for pat in patterns:
            m = re.match(pat, line)
            if m:
                t = m.group(1) or m.group(2)
                if t:
                    targets.append(t)
                break
    return targets

def extract_apis(text):
    """Return list of (method, path)."""
    apis = []
    for line in text.splitlines():
        for pat, _fw in API_PATTERNS:
            m = re.search(pat, line)
            if m:
                if m.lastindex and m.lastindex >= 2:
                    method = (m.group(1) or "any").upper()
                    path = m.group(2)
                else:
                    method, path = "ANY", m.group(1)
                apis.append({"method": method, "path": path})
                break
    return apis

def scan_file(root, rel_path):
    full = Path(root) / rel_path
    try:
        stat = full.stat()
        # utf-8-sig strips a leading BOM so first-line patterns (class/import) match
        text = full.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return None
    lang = file_lang(rel_path)
    lines = text.count("\n") + 1
    rec = {
        "path": rel_path,
        "lang": lang,
        "lines": lines,
        "size": stat.st_size,
        "mtime": int(stat.st_mtime),
        "hash": file_hash(full),
    }
    if lang and lang in SYMBOL_PATTERNS:
        rec["symbols"] = extract_symbols(text, lang)
        rec["imports"] = extract_imports(text, lang)
        apis = extract_apis(text)
        if apis:
            rec["apis"] = apis
    return rec

def collect_files(root, languages=None):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in DEFAULT_EXCLUDES]
        for fn in filenames:
            rel = os.path.relpath(os.path.join(dirpath, fn), root).replace("\\", "/")
            if is_excluded(rel):
                continue
            lang = file_lang(rel)
            if languages:
                ext = rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
                # accept language name ("python") or extension alias ("py" / "md")
                if lang and lang not in languages and ext not in languages:
                    continue
                if not lang and ext not in languages:
                    continue
            files.append(rel)
    return sorted(files)

def build_index(root, languages=None):
    t0 = time.time()
    files = collect_files(root, languages)
    files_data = {}
    symbols = defaultdict(list)
    imports = defaultdict(list)
    apis = defaultdict(list)
    lang_count = defaultdict(int)
    total_lines = 0

    for rel in files:
        rec = scan_file(root, rel)
        if not rec:
            continue
        files_data[rel] = rec
        total_lines += rec["lines"]
        if rec["lang"]:
            lang_count[rec["lang"]] += 1
        for s in rec.get("symbols", []):
            symbols[s["name"]].append({"file": rel, "line": s["line"], "kind": s["kind"], "sig": s["signature"]})
        for imp in rec.get("imports", []):
            imports[rel].append(imp)
        for api in rec.get("apis", []):
            apis[rel].append(api)

    idx = Path(root) / INDEX_DIR
    idx.mkdir(parents=True, exist_ok=True)
    save_json(idx / "files.json", files_data)
    save_json(idx / "symbols.json", dict(symbols))
    save_json(idx / "imports.json", dict(imports))
    save_json(idx / "api.json", dict(apis))
    save_json(idx / "meta.json", {
        "version": 1,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "files": len(files_data),
        "symbols": sum(len(v) for v in symbols.values()),
        "apis": sum(len(v) for v in apis.values()),
        "lines": total_lines,
        "languages": dict(lang_count),
        "duration_s": round(time.time() - t0, 1),
    })
    # impact: reverse dependency map
    impact = defaultdict(list)
    for f, imps in imports.items():
        for imp in imps:
            impact[imp].append(f)
    save_json(idx / "impact.json", dict(impact))
    meta = load_json(idx / "meta.json")
    log(f"build done: {meta['files']} files, {meta['symbols']} symbols, {meta['apis']} apis in {meta['duration_s']}s")
    return meta

def update_index(root):
    idx = Path(root) / INDEX_DIR
    files_data = load_json(idx / "files.json", {})
    symbols = load_json(idx / "symbols.json", {})
    imports = load_json(idx / "imports.json", {})
    apis = load_json(idx / "api.json", {})
    impact = load_json(idx / "impact.json", {})

    changed = git_changed_files(root)
    all_files = set(collect_files(root))
    deleted = set(files_data.keys()) - all_files

    # deleted
    for rel in deleted:
        files_data.pop(rel, None)
        imports.pop(rel, None)
        apis.pop(rel, None)
        for name, entries in list(symbols.items()):
            symbols[name] = [e for e in entries if e["file"] != rel]
            if not symbols[name]:
                symbols.pop(name, None)
    # changed (from git) + mtime/hash drift
    to_update = set(changed) & all_files
    for rel in all_files:
        if rel in to_update:
            continue
        rec = files_data.get(rel)
        if rec:
            try:
                cur_mtime = int((Path(root) / rel).stat().st_mtime)
                if cur_mtime != rec.get("mtime"):
                    to_update.add(rel)
            except OSError:
                to_update.add(rel)
        else:
            to_update.add(rel)

    for rel in sorted(to_update):
        old = files_data.get(rel)
        if old:
            for name, entries in list(symbols.items()):
                symbols[name] = [e for e in entries if e["file"] != rel]
                if not symbols[name]:
                    symbols.pop(name, None)
        rec = scan_file(root, rel)
        if rec:
            files_data[rel] = rec
            for s in rec.get("symbols", []):
                symbols.setdefault(s["name"], []).append({"file": rel, "line": s["line"], "kind": s["kind"], "sig": s["signature"]})
            if rec.get("imports"):
                imports[rel] = rec["imports"]
            if rec.get("apis"):
                apis[rel] = rec["apis"]
        else:
            files_data.pop(rel, None)

    # rebuild impact
    impact = defaultdict(list)
    for f, imps in imports.items():
        for imp in imps:
            impact[imp].append(f)

    idx.mkdir(parents=True, exist_ok=True)
    save_json(idx / "files.json", files_data)
    save_json(idx / "symbols.json", dict(symbols))
    save_json(idx / "imports.json", dict(imports))
    save_json(idx / "api.json", dict(apis))
    save_json(idx / "impact.json", dict(impact))
    meta = load_json(idx / "meta.json", {})
    meta.update({
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "files": len(files_data),
        "symbols": sum(len(v) for v in symbols.values()),
        "apis": sum(len(v) for v in apis.values()),
        "updated_files": len(to_update),
        "deleted_files": len(deleted),
    })
    save_json(idx / "meta.json", meta)
    log(f"update done: {len(to_update)} changed, {len(deleted)} deleted, {meta['files']} total files")
    return meta

def query_symbols(symbols, name):
    name_l = name.lower()
    exact = symbols.get(name)
    if exact:
        return exact
    # fuzzy: case-insensitive contains, then subsequence
    hits = []
    for key, entries in symbols.items():
        if name_l in key.lower():
            hits.extend(entries)
    if not hits:
        for key, entries in symbols.items():
            k = key.lower()
            i = j = 0
            while i < len(k) and j < len(name_l):
                if k[i] == name_l[j]:
                    j += 1
                i += 1
            if j == len(name_l):
                hits.extend(entries)
    return hits

def main():
    ap = argparse.ArgumentParser(description="repo-index code indexer")
    ap.add_argument("command", choices=["build", "update", "query", "impact", "meta"])
    ap.add_argument("--root", default=".", help="project root")
    ap.add_argument("--languages", default="", help="comma separated: py,ts,js,go,rs,... (default: all)")
    ap.add_argument("--symbol", default="")
    ap.add_argument("--file", default="")
    ap.add_argument("--api", default="")
    ap.add_argument("--fuzzy", default="")
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print(f"error: not a directory: {root}", file=sys.stderr)
        sys.exit(1)
    langs = {x.strip() for x in args.languages.split(",") if x.strip()} or None
    idx = Path(root) / INDEX_DIR

    if args.command == "build":
        build_index(root, langs)
        return
    if args.command == "update":
        if not idx.exists():
            log("no index found, doing full build")
            build_index(root, langs)
        else:
            update_index(root)
        return
    if args.command == "meta":
        meta = load_json(idx / "meta.json")
        if not meta:
            print("no index. run: python indexer.py build --root <project>")
            sys.exit(1)
        print(json.dumps(meta, ensure_ascii=False, indent=1))
        return

    # query / impact need index
    if not idx.exists():
        print("no index found. run: python indexer.py build --root <project>")
        sys.exit(1)

    if args.command == "impact":
        target = args.file
        if not target:
            print("--file required for impact", file=sys.stderr)
            sys.exit(1)
        imports = load_json(idx / "imports.json", {})
        files_data = load_json(idx / "files.json", {})
        # direct dependents: files importing target (by path substring or module name)
        target_base = target.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        dependents = []
        for f, imps in imports.items():
            for imp in imps:
                imp_base = imp.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                if imp == target or imp.endswith(target) or imp_base == target_base or target_base in imp:
                    dependents.append({"file": f, "imports": imp})
                    break
        # reverse-dependents (who imports the dependents) - one more hop
        print(json.dumps({"target": target, "direct_dependents": dependents,
                          "note": "files importing this module; run tests on these + target"}, ensure_ascii=False, indent=1))
        return

    # query
    symbols = load_json(idx / "symbols.json", {})
    files_data = load_json(idx / "files.json", {})
    apis = load_json(idx / "api.json", {})
    limit = args.limit

    if args.symbol:
        hits = query_symbols(symbols, args.symbol)
        print(json.dumps(hits[:limit], ensure_ascii=False, indent=1))
    elif args.file:
        target = args.file
        rec = files_data.get(target)
        if rec:
            out = {k: v for k, v in rec.items() if k != "hash"}
            print(json.dumps(out, ensure_ascii=False, indent=1))
        else:
            # fuzzy path match
            matches = [f for f in files_data if args.file.lower() in f.lower()]
            print(json.dumps(matches[:limit], ensure_ascii=False, indent=1))
    elif args.api:
        pat = args.api.lower()
        hits = []
        for f, lst in apis.items():
            for a in lst:
                if pat in a["path"].lower() or pat in a["method"].lower():
                    hits.append({"file": f, "method": a["method"], "path": a["path"]})
        print(json.dumps(hits[:limit], ensure_ascii=False, indent=1))
    elif args.fuzzy:
        kw = args.fuzzy.lower()
        hits = []
        for name, entries in symbols.items():
            if kw in name.lower():
                for e in entries[:3]:
                    hits.append({"symbol": name, "kind": e["kind"], "file": e["file"], "line": e["line"]})
        if len(hits) < limit:
            for f in files_data:
                if kw in f.lower():
                    hits.append({"file": f})
        print(json.dumps(hits[:limit], ensure_ascii=False, indent=1))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
