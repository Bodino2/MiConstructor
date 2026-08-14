(() => {
  const refresh = (shell) => void shell.refreshHeader();
  if (window.MiConstructorShell) refresh(window.MiConstructorShell);
  else window.addEventListener(
    "miconstructor:shell-ready",
    (event) => refresh(event.detail),
    { once: true },
  );
})();