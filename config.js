/*
 * Nastavenia stránky – jediný súbor, ktorý treba pri zmene upraviť.
 */
window.SITE_CONFIG = {
  // Služba, ktorá doručí návrhy z formulára na váš e-mail (bez vlastného servera):
  //   "web3forms"  – kľúč získate na https://web3forms.com (zadáte e-mail, kľúč príde e-mailom; kľúč môže byť verejný)
  //   "formsubmit" – https://formsubmit.co; po prvom odoslaní potvrďte e-mail a sem zadajte náhodný alias, ktorý dostanete
  formProvider: "web3forms",
  web3formsKey: "ddc7a5b5-94b2-4472-8d13-44395039cad1",
  formsubmitId: "",
  // Prevádzkovateľ stránky (uvádza sa v časti Ochrana údajov)
  operator: "Igor Raab",
  // Kontaktná adresa (nepovinné; ak je prázdna, kontakt je cez formulár). Rozdelená, aby ju nenašli zberače adries.
  contactEmail: { user: "", domain: "" },
  // Ako dlho sa návrhy uchovávajú po spracovaní
  retention: "najviac 12 mesiacov",
  // Mapový podklad (bez API kľúča)
  basemap: "https://tiles.openfreemap.org/styles/positron",
};
