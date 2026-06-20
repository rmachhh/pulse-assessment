# Phase 1
- Dev Origins
    - Set-up allowed dev origins to make this application work on mylocal\
- crypto.randomUUID() is not a function when browser insecurely
    - How: browsed the website using an insecure http url instead of https
    - Cause: crypto.randomUUID() only exist when browsing securely
    - Fix: A small utility that tries the native API first, then falls back to a manual UUID v4 using crypto.getRandomValues()