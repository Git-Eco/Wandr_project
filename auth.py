import streamlit as st
import db

def _init():
    if "auth_panel" not in st.session_state:
        st.session_state.auth_panel = "login"

def show_auth():
    _init()
    panel = st.session_state.auth_panel
    is_login = panel == "login"

    headline   = "Welcome back!"       if is_login else "Hello, traveller!"
    body       = "Your next adventure is waiting. Sign in to pick up where you left off." if is_login else "Create an account and let Wandr plan your perfect trip — from day one to the last sunset."
    switch_txt = "No account yet? Create one." if is_login else "Already have an account? Sign in."
    form_title = "Sign in"             if is_login else "Create account"
    form_sub   = "Welcome back, traveller." if is_login else "Start planning your adventures."
    btn_label  = "Sign In"             if is_login else "Create Account"

    st.markdown(f"""
    <style>
    /* ── 1. Smooth Entry Animation (Fixes 'Missing' elements) ── */
    @keyframes fastFadeIn {{
        0% {{ opacity: 0; }}
        /* Stay invisible for 0.1s to let text inputs load */
        20% {{ opacity: 0; }} 
        100% {{ opacity: 1; }}
    }}

    [data-testid="stHorizontalBlock"] {{
        animation: fastFadeIn 0.5s ease-out forwards !important;
    }}

    /* ── 2. Force No-Blur during Login ── */
    .stApp[data-state="running"] [data-testid="stAppViewContainer"] {{
        filter: none !important;
        opacity: 1 !important;
    }}

    /* ── 2. Global & Chrome Cleanup ── */
    header[data-testid="stHeader"], footer, 
    [data-testid="stToolbar"], [data-testid="stDecoration"],
    [data-testid="stHeaderActionElements"] {{ 
        display:none !important; 
    }}
    
    [data-testid="stMarkdownContainer"] h1 a, 
    [data-testid="stMarkdownContainer"] h2 a, 
    [data-testid="stMarkdownContainer"] h3 a {{ 
        display: none !important; 
    }}

    .auth-footer-row {{
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        gap: 6px !important;
        margin-top: 20px !important;
        width: 100% !important;
    }}

    .prompt-text {{
        color: #666 !important;
        font-size: 0.9rem !important;
    }}

    /* This styles the standard <a> tag - Streamlit cannot force this to be orange */
    .custom-switch-link {{
        color: #20878E !important;
        text-decoration: underline !important;
        font-weight: 600 !important;
        font-size: 0.9rem !important;
        cursor: pointer !important;
        border: none !important;
        background: none !important;
    }}

    .custom-switch-link:hover {{
        color: #166a70 !important;
        text-decoration: none !important;
    }}
    
    /* 3. Hide the right decorative column on Mobile */
    @media (max-width: 767px) {{
        [data-testid="stHorizontalBlock"] > div:nth-child(2) {{
            display: none !important;
        }}
        [data-testid="stHorizontalBlock"] > div:nth-child(1) {{
            width: 100% !important;
            padding: 2.5rem 1.5rem !important;
        }}
    }}

    /* ── 3. Main Card Layout ── */
    [data-testid="stHorizontalBlock"] {{
        background: white !important;
        border-radius: 22px !important;
        box-shadow: 0 8px 48px rgba(0,0,0,0.16) !important;
        max-width: 820px !important;
        margin: auto !important;
        overflow: visible !important; 
        gap: 0 !important;
    }}

    [data-testid="stHorizontalBlock"] > div:nth-child(1) {{
        padding: 3.5rem 3rem !important;
    }}

    [data-testid="stHorizontalBlock"] > div:nth-child(2) {{
        background: linear-gradient(145deg, #20878E 0%, #0d5a60 100%) !important;
        padding: 2.5rem !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        border-radius: 0 22px 22px 0 !important;
    }}

    /* ── 4. Input Fields ── */
    [data-testid="stTextInput"] [data-baseweb="base-input"] {{
        background-color: #f7f7f7 !important;
        border: 1.5px solid #ebebeb !important;
        border-radius: 10px !important;
    }}

    [data-testid="stTextInput"] input {{
        background-color: transparent !important;
        border: none !important;
        color: #1a1a1a !important;
    }}

    /* ── 5. Buttons ── */
    /* Left side primary button */
    [data-testid="stHorizontalBlock"] > div:nth-child(1) button[kind="primary"] {{
        background: linear-gradient(135deg, #20878E, #92C4C6) !important;
        color: white !important;
        border-radius: 10px !important;
        height: 3.2rem !important;
        font-weight: 700 !important;
        margin-top: 1rem !important;
        border: none !important;
    }}

    /* Right side switch button */
    [data-testid="stHorizontalBlock"] > div:nth-child(2) button {{
        background: rgba(255,255,255,0.15) !important;
        color: white !important;
        border: 1px solid rgba(255,255,255,0.3) !important;
        border-radius: 25px !important;
        font-weight: 600 !important;
        padding: 0.6rem 2.5rem !important;
        min-width: 210px !important;
        text-transform: none !important; 
    }}
    </style>
    """, unsafe_allow_html=True)

    # ── Two-column layout ─────────────────────────────────────────
    left, right = st.columns(2, gap="small")

    with left:
        st.markdown(f"""
        <h2 style="font-size:1.75rem;font-weight:800;color:#1a1a1a;margin:0 0 0.2rem;">
            {form_title}
        </h2>
        <p style="color:#bbb;font-size:0.82rem;margin:0 0 1.2rem;">{form_sub}</p>
        """, unsafe_allow_html=True)

        email    = st.text_input("e", key="auth_email",   placeholder="Email address",       label_visibility="collapsed")
        password = st.text_input("p", key="auth_pass",    placeholder="Password",            label_visibility="collapsed", type="password")
        
        if not is_login:
            confirm = st.text_input("c", key="auth_confirm", placeholder="Confirm password", label_visibility="collapsed", type="password")

        # Main Sign In / Create Account Button
        if st.button(btn_label, use_container_width=True, type="primary", key="auth_btn"):
            if is_login:
                _do_login(email, password)
            else:
                _do_signup(email, password, st.session_state.get("auth_confirm", ""))

        prompt_text = "Not a member?" if is_login else "Already a member?"
        link_text = "Sign up now" if is_login else "Sign in now"
        target_panel = "signup" if is_login else "login"

        st.markdown(f"""
            <div class="auth-footer-row">
                <span class="prompt-text">{prompt_text}</span>
                <a href="?panel={target_panel}" target="_self" class="custom-switch-link">
                    {link_text}
                </a>
            </div>
        """, unsafe_allow_html=True)

        query_params = st.query_params
        if query_params.get("panel") == target_panel:
            st.session_state.auth_panel = target_panel
            st.query_params.clear() # Clean the URL
            for k in ["auth_email", "auth_pass", "auth_confirm"]:
                st.session_state.pop(k, None)
            st.rerun()

    with right:
        st.markdown(f"""
        <div style="display:flex;flex-direction:column;align-items:center;
             justify-content:center;text-align:center;color:white;height:100%;min-height:360px;">
            <div style="font-size:2.6rem;margin-bottom:0.5rem;">✈️</div>
            <h1 style="font-size:1.9rem;font-weight:800;color:white;margin:0 0 0.3rem;">Wandr</h1>
            <h3 style="font-size:1.05rem;font-weight:700;color:white;margin:0 0 0.7rem;">{headline}</h3>
            <p style="font-size:0.85rem;opacity:0.82;line-height:1.65;
               max-width:260px;margin:0 0 1.8rem;">{body}</p>
        </div>
        """, unsafe_allow_html=True)

def _do_login(email, password):
    if not email or not password:
        st.error("Please fill in both fields.")
        return
    try:
        res = db.sign_in(email, password)
        if res.session:
            st.session_state.auth_session = res.session
            st.session_state.auth_user = res.user
            st.rerun()
        else:
            st.error("Invalid email or password.")
    except Exception as e:
        st.error(f"Sign in failed: {e}")


def _do_signup(email, password, confirm):
    if not email or not password:
        st.error("Please fill in all fields.")
        return
    if password != confirm:
        st.error("Passwords don't match.")
        return
    if len(password) < 6:
        st.error("Password must be at least 6 characters.")
        return
    try:
        res = db.sign_up(email, password)
        if res.user:
            st.success("Account created! You can now sign in.")
            st.session_state.auth_panel = "login"
            st.rerun()
        else:
            st.error("Sign up failed. Try a different email.")
    except Exception as e:
        st.error(f"Sign up failed: {e}")


def is_authenticated() -> bool:
    return "auth_session" in st.session_state and st.session_state.auth_session is not None


def get_user_id() -> str | None:
    if is_authenticated():
        return st.session_state.auth_user.id
    return None


def logout():
    db.sign_out()
    for key in ["auth_session", "auth_user", "all_trips"]:
        st.session_state.pop(key, None)
    st.rerun()
