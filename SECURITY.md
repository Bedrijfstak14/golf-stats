# Beveiligingsbeleid

## Een kwetsbaarheid melden

Meld beveiligingsproblemen **niet** via een openbare issue. Gebruik in plaats daarvan
[**Report a vulnerability**](https://github.com/Bedrijfstak14/golf-stats/security/advisories/new)
(GitHub private vulnerability reporting). Alleen de maintainer ziet je melding.

Zet in je melding:

- wat het probleem is en welke impact het heeft;
- stappen of een proof of concept om het te reproduceren;
- de commit of versie waarop je het vond.

Je krijgt binnen een week een eerste reactie. Een fix komt in `main`, en na afloop wordt de advisory gepubliceerd, met vermelding van je naam als je dat wilt.

## Ondersteunde versies

Alleen de laatste versie op `main` krijgt beveiligingsupdates.

## Wat de app zelf doet

- Wachtwoorden worden met bcrypt gehasht. Sessies staan in de database, en het cookie bevat alleen een willekeurig token (`HttpOnly`, `SameSite`, `Secure` over https).
- Na het eerste account kun je je alleen via een uitnodigingslink registreren.
- Er zijn rate limits op inloggen (per IP en per e-mailadres), uploads, schrijfacties en herberekeningen.
- Elke Gemini-aanroep gaat langs een budget in de database (per dag, per maand, per speler en per import). Zo kan misbruik geen onbeperkte AI-kosten veroorzaken.
- De Gemini API-sleutel staat alleen op de server.
- Strikte security headers: CSP, `frame-ancestors 'none'`, `nosniff`, HSTS en een Permissions-Policy.
- De container draait als een niet-root-gebruiker.

## In de repository

- Dependabot-alerts en automatische security updates
- Secret scanning met push protection
- CodeQL (`security-extended`) op elke push en pull request, plus elke week
- Dependency review op pull requests
- OpenSSF Scorecard
- GitHub Actions zijn vastgezet op commit-SHA met alleen-lezen-rechten als standaard
