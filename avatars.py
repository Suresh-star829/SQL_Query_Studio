import uuid
from werkzeug.utils import secure_filename

AVATAR_DIR = BASE_DIR / "static" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

PROFILES_FILE = BASE_DIR / "data" / "profiles.json"
PROFILES_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load_json_store(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save_json_store(path: Path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


_USER_PROFILES = _load_json_store(PROFILES_FILE, {})


def _get_user_record(username: str):
    if username in AUTH_USERS:
        return AUTH_USERS[username]
    return None


def _build_profile_payload(username: str):
    rec = _get_user_record(username) or {}
    prof = _USER_PROFILES.get(username, {})
    return {
        "username": username,
        "role": rec.get("role", "viewer"),
        "display_name": prof.get("display_name") or username,
        "email": prof.get("email", ""),
        "department": prof.get("department", ""),
        "avatar_url": prof.get("avatar_url", ""),
    }


@app.get("/api/profile")
@login_required
def api_get_profile():
    user = g.current_user
    return jsonify({"success": True, "profile": _build_profile_payload(user["username"])})


@app.put("/api/profile")
@login_required
def api_update_profile():
    user = g.current_user
    username = user["username"]
    data = request.get_json(silent=True) or {}

    display_name = (data.get("display_name") or "").strip()[:80]
    email = (data.get("email") or "").strip()[:120]
    department = (data.get("department") or "").strip()[:80]

    current = _USER_PROFILES.get(username, {})
    current.update(
        {
            "display_name": display_name or username,
            "email": email,
            "department": department,
        }
    )
    _USER_PROFILES[username] = current
    _save_json_store(PROFILES_FILE, _USER_PROFILES)

    return jsonify({"success": True, "profile": _build_profile_payload(username)})


@app.post("/api/profile/avatar")
@login_required
def api_upload_avatar():
    if "avatar" not in request.files:
        return jsonify({"success": False, "error": "No image file provided."}), 400

    file = request.files["avatar"]
    if not file or not file.filename:
        return jsonify({"success": False, "error": "Empty filename."}), 400

    ext = Path(secure_filename(file.filename)).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({"success": False, "error": "Unsupported image format."}), 400

    file.seek(0, os.SEEK_END)
    size_bytes = file.tell()
    file.seek(0)
    if size_bytes > 2 * 1024 * 1024:
        return jsonify({"success": False, "error": "Image must be 2 MB or smaller."}), 400

    username = g.current_user["username"]
    filename = f"{secure_filename(username)}_{uuid.uuid4().hex[:10]}{ext}"
    save_path = AVATAR_DIR / filename
    file.save(str(save_path))

    avatar_url = f"/static/avatars/{filename}"
    current = _USER_PROFILES.get(username, {})
    current["avatar_url"] = avatar_url
    _USER_PROFILES[username] = current
    _save_json_store(PROFILES_FILE, _USER_PROFILES)

    return jsonify({"success": True, "avatar_url": avatar_url, "profile": _build_profile_payload(username)})


@app.get("/api/admin/employees")
@roles_required("admin")
def api_list_employees():
    employees = []
    for uname, rec in AUTH_USERS.items():
        prof = _USER_PROFILES.get(uname, {})
        employees.append(
            {
                "username": uname,
                "role": rec.get("role", "viewer"),
                "display_name": prof.get("display_name") or uname,
                "email": prof.get("email", ""),
                "department": prof.get("department", ""),
            }
        )
    return jsonify({"success": True, "employees": employees})


@app.post("/api/admin/employees")
@roles_required("admin")
def api_grant_employee_access():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "viewer").strip().lower()
    display_name = (data.get("display_name") or username).strip()[:80]
    email = (data.get("email") or "").strip()[:120]
    department = (data.get("department") or "").strip()[:80]

    if role not in ("viewer", "analyst", "admin"):
        return jsonify({"success": False, "error": "Invalid role."}), 400

    if not username or len(username) > 50 or not re.match(r"^[a-zA-Z0-9._-]+$", username):
        return jsonify({"success": False, "error": "Username must be letters, numbers, '.', '_', or '-'."}), 400

    if username in AUTH_USERS:
        # Update existing employee's role/profile (and password only if supplied)
        AUTH_USERS[username]["role"] = role
        if password:
            if len(password) < 6:
                return jsonify({"success": False, "error": "Password must be at least 6 characters."}), 400
            AUTH_USERS[username]["password_hash"] = generate_password_hash(password)
    else:
        if len(password) < 6:
            return jsonify({"success": False, "error": "Password must be at least 6 characters."}), 400
        AUTH_USERS[username] = {
            "password_hash": generate_password_hash(password),
            "role": role,
        }

    prof = _USER_PROFILES.get(username, {})
    prof.update(
        {
            "display_name": display_name or username,
            "email": email,
            "department": department,
        }
    )
    _USER_PROFILES[username] = prof
    _save_json_store(PROFILES_FILE, _USER_PROFILES)

    return jsonify(
        {
            "success": True,
            "employee": {
                "username": username,
                "role": role,
                "display_name": prof["display_name"],
                "email": prof["email"],
                "department": prof["department"],
            },
        }
    )


@app.delete("/api/admin/employees/<username>")
@roles_required("admin")
def api_revoke_employee_access(username):
    if username == g.current_user["username"]:
        return jsonify({"success": False, "error": "You cannot revoke your own active session."}), 400
    if username not in AUTH_USERS:
        return jsonify({"success": False, "error": "Employee not found."}), 404

    AUTH_USERS.pop(username, None)
    return jsonify({"success": True})