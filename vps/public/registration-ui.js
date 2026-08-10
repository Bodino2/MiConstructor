const CLIENT_HELP = "Crea una cuenta de cliente para publicar proyectos, comparar propuestas y gestionar la obra con trazabilidad.";
const PROFESSIONAL_HELP = "Los profesionales completan una evaluación técnica específica antes de enviar su solicitud de verificación.";

function applyRegistrationRoleState() {
  const form = document.querySelector("#register-form");
  if (!form) return;

  const role = form.querySelector("#role");
  const professionalFields = form.querySelector("#professional-fields");
  const context = form.querySelector("header p");
  if (!role || !professionalFields) return;

  const professional = role.value === "profesional";
  professionalFields.hidden = !professional;
  professionalFields.style.display = professional ? "" : "none";

  professionalFields.querySelectorAll("input, select, textarea, button").forEach((field) => {
    field.disabled = !professional;
    if (["companyName", "phone", "specialty"].includes(field.name)) {
      field.required = professional;
    }
  });

  if (context) context.textContent = professional ? PROFESSIONAL_HELP : CLIENT_HELP;

  if (!form.dataset.roleUiBound) {
    role.addEventListener("change", applyRegistrationRoleState);
    form.dataset.roleUiBound = "true";
  }
}

const registrationObserver = new MutationObserver(applyRegistrationRoleState);
registrationObserver.observe(document.querySelector("#app"), { childList: true, subtree: true });
applyRegistrationRoleState();
