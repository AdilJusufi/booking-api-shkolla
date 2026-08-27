using System.Net;

namespace Booking.Infrastructure.Notifications.Templates;

/// <summary>Përmbajtja e gatshme për dërgim — html dhe text ndërtohen gjithmonë bashkë, kurrë veç e veç.</summary>
public sealed record EmailContent(string Subject, string Html, string Text);

/// <summary>
/// Ndërtuesit e email-eve "vetë-shërbyese" dhe të ciklit të klinikës. Çdo metodë vendos
/// stringjet e përmbajtjes (shqip, të fiksuara) NË KRYE, ndarë qartë nga markup-u i
/// EmailLayout — kur të shtohet lokalizimi (shih shënimin te AuthService/BuildAuthLink),
/// këto stringje janë pikërisht ato që zhvendosen te burime resx/json për-gjuhë; layout-i
/// nuk ndryshon fare.
/// </summary>
public static class EmailTemplates
{
    private const string TokenLifespanNote = "Ky link është i vlefshëm për 24 orë.";

    public static EmailContent Confirmation(string firstName, string confirmUrl, string? resendUrl)
    {
        const string subject = "Konfirmo llogarinë tënde";
        var greeting = $"Përshëndetje {firstName},";
        var intro = "Faleminderit që u regjistruat në Rezervo Mjekun! Për të përfunduar regjistrimin dhe për t'u kyçur, konfirmoni email-in tuaj:";
        const string buttonLabel = "Konfirmo Email-in";
        const string afterButton = "Nëse s'e keni krijuar ju këtë llogari, thjesht injoroni këtë email.";
        var expiredHintHtml = resendUrl is null
            ? "Nëse linku ka skaduar, mund të kërkoni një email të ri konfirmimi nga faqja e hyrjes."
            : $"""Nëse linku ka skaduar, mund të <a href="{WebUtility.HtmlEncode(resendUrl)}" style="color:#12796e;">kërkoni një email të ri konfirmimi</a>.""";
        var expiredHintText = resendUrl is null
            ? "Nëse linku ka skaduar, mund të kërkoni një email të ri konfirmimi nga faqja e hyrjes."
            : $"Nëse linku ka skaduar, mund të kërkoni një email të ri konfirmimi këtu: {resendUrl}";

        var html =
            EmailLayout.Paragraph(greeting) +
            EmailLayout.Paragraph(intro) +
            EmailLayout.Button(confirmUrl, buttonLabel) +
            EmailLayout.FallbackUrlBlock(confirmUrl) +
            $"""<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7472;line-height:1.5;">{TokenLifespanNote} {expiredHintHtml}</p>""" +
            EmailLayout.Paragraph(afterButton);

        var text = EmailLayout.WrapText(
            $"""
             {greeting}

             {intro}

             {EmailLayout.TextLink(buttonLabel, confirmUrl)}

             {TokenLifespanNote} {expiredHintText}

             {afterButton}
             """,
            EmailLayout.DefaultFooter());

        return new EmailContent(subject, EmailLayout.Wrap(subject, html, EmailLayout.DefaultFooter()), text);
    }

    public static EmailContent PasswordReset(string firstName, string resetUrl, string? forgotPasswordUrl)
    {
        const string subject = "Rivendos fjalëkalimin";
        var greeting = $"Përshëndetje {firstName},";
        const string intro = "Keni kërkuar rivendosjen e fjalëkalimit për llogarinë tuaj në Rezervo Mjekun. Për të vendosur një fjalëkalim të ri, klikoni butonin më poshtë:";
        const string buttonLabel = "Rivendos Fjalëkalimin";
        const string afterButton = "Nëse s'e keni kërkuar ju këtë, injorojeni këtë email — fjalëkalimi juaj mbetet i pandryshuar.";

        var expiredHintHtml = forgotPasswordUrl is null
            ? "Nëse linku ka skaduar, mund të kërkoni një link të ri rivendosjeje nga faqja e hyrjes."
            : $"""Nëse linku ka skaduar, mund të <a href="{WebUtility.HtmlEncode(forgotPasswordUrl)}" style="color:#12796e;">kërkoni një link të ri</a>.""";
        var expiredHintText = forgotPasswordUrl is null
            ? "Nëse linku ka skaduar, mund të kërkoni një link të ri rivendosjeje nga faqja e hyrjes."
            : $"Nëse linku ka skaduar, mund të kërkoni një link të ri këtu: {forgotPasswordUrl}";

        var html =
            EmailLayout.Paragraph(greeting) +
            EmailLayout.Paragraph(intro) +
            EmailLayout.Button(resetUrl, buttonLabel) +
            EmailLayout.FallbackUrlBlock(resetUrl) +
            $"""<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7472;line-height:1.5;">{TokenLifespanNote} {expiredHintHtml}</p>""" +
            EmailLayout.Paragraph(afterButton);

        var text = EmailLayout.WrapText(
            $"""
             {greeting}

             {intro}

             {EmailLayout.TextLink(buttonLabel, resetUrl)}

             {TokenLifespanNote} {expiredHintText}

             {afterButton}
             """,
            EmailLayout.DefaultFooter());

        return new EmailContent(subject, EmailLayout.Wrap(subject, html, EmailLayout.DefaultFooter()), text);
    }

    /// <summary>Konfirmim te mbajtësi i ri i llogarisë: aplikimi u pranua, klinika pret rishikim.</summary>
    public static EmailContent ClinicPendingReview(string adminFullName, string clinicName, string? myClinicsUrl)
    {
        const string subject = "Klinika juaj është në rishikim";
        var greeting = $"Përshëndetje {adminFullName},";
        var encodedClinicName = WebUtility.HtmlEncode(clinicName);
        var intro = $"""Aplikimi juaj për klinikën <strong>{encodedClinicName}</strong> u pranua dhe është në rishikim.""";
        const string explanation = "Deri sa ekipi ynë ta verifikojë, klinika nuk shfaqet në kërkimin publik dhe menaxhimi i degëve, shërbimeve dhe mjekëve mbetet i mbyllur. Mund të kyçeni që tani dhe do ta shihni klinikën në gjendjen \"Në pritje\".";
        const string outro = "Do t'ju njoftojmë me email sapo rishikimi të përfundojë.";
        const string buttonLabel = "Shiko Klinikën Time";

        var html =
            EmailLayout.Paragraph(greeting) +
            $"""<p style="margin:0 0 16px 0;">{intro}</p>""" +
            EmailLayout.Paragraph(explanation) +
            (myClinicsUrl is not null
                ? EmailLayout.Button(myClinicsUrl, buttonLabel) + EmailLayout.FallbackUrlBlock(myClinicsUrl)
                : string.Empty) +
            EmailLayout.Paragraph(outro);

        var text = EmailLayout.WrapText(
            $"""
             {greeting}

             Aplikimi juaj për klinikën "{clinicName}" u pranua dhe është në rishikim.

             {explanation}

             {(myClinicsUrl is not null ? EmailLayout.TextLink(buttonLabel, myClinicsUrl) + "\n\n" : "")}{outro}
             """,
            EmailLayout.DefaultFooter());

        return new EmailContent(subject, EmailLayout.Wrap(subject, html, EmailLayout.DefaultFooter()), text);
    }

    public static EmailContent ClinicApproved(string clinicName, string? myClinicsUrl)
    {
        const string subject = "Klinika juaj u aprovua";
        var encodedClinicName = WebUtility.HtmlEncode(clinicName);
        var intro = $"""Klinika <strong>{encodedClinicName}</strong> u aprovua.""";
        const string explanation = "Që tani ajo shfaqet në kërkimin publik dhe mund të menaxhoni degët, shërbimet dhe mjekët e saj.";
        const string buttonLabel = "Shiko Klinikën Time";

        var html =
            $"""<p style="margin:0 0 16px 0;">{intro}</p>""" +
            EmailLayout.Paragraph(explanation) +
            (myClinicsUrl is not null
                ? EmailLayout.Button(myClinicsUrl, buttonLabel) + EmailLayout.FallbackUrlBlock(myClinicsUrl)
                : string.Empty);

        var text = EmailLayout.WrapText(
            $"""
             Klinika "{clinicName}" u aprovua.

             {explanation}

             {(myClinicsUrl is not null ? EmailLayout.TextLink(buttonLabel, myClinicsUrl) : "")}
             """,
            EmailLayout.DefaultFooter());

        return new EmailContent(subject, EmailLayout.Wrap(subject, html, EmailLayout.DefaultFooter()), text);
    }

    /// <summary>
    /// Për SuperAdmin — i brendshëm, trajtim më i thjeshtë me qëllim: listë e dhënash
    /// dhe një link i thjeshtë, jo buton i madh CTA (shih kërkesën origjinale).
    /// </summary>
    public static EmailContent NewClinicAwaitingReview(
        string clinicName,
        Guid clinicId,
        string? clinicPhoneNumber,
        string? clinicEmail,
        string? website,
        IReadOnlyList<string> branchCities,
        string adminFullName,
        string adminEmail,
        string? adminPhoneNumber,
        DateTime submittedAtUtc,
        int clinicsWithSameName,
        string? reviewUrl)
    {
        const string subject = "Klinikë e re në pritje të aprovimit";
        string Or(string? v) => string.IsNullOrWhiteSpace(v) ? "—" : v;
        var citiesText = branchCities.Count == 0 ? "—" : string.Join(", ", branchCities);

        // Vlerat e papërpunuara (asnjë encoding) — burimi i vetëm i së vërtetës. Rreshtat
        // HTML dhe tekst ndërtohen prej TË NJËJTAVE vlera, secili me encoding-un e vet,
        // që të mos ketë rrezik dyfishimi (encode→encode) ose rrjedhjeje (encode→decode).
        var rawRows = new (string Label, string Value)[]
        {
            ("Klinika", clinicName),
            ("ID", clinicId.ToString()),
            ("Telefoni", Or(clinicPhoneNumber)),
            ("Email", Or(clinicEmail)),
            ("Web", Or(website)),
            ("Qytetet e degëve", citiesText),
            ("Mbajtësi i llogarisë", adminFullName),
            ("Email mbajtësi", adminEmail),
            ("Telefoni i mbajtësit", Or(adminPhoneNumber)),
            ("Paraqitur më", $"{submittedAtUtc:dd.MM.yyyy HH:mm} UTC"),
        };

        var tableRowsHtml = string.Join("\n", rawRows.Select(r =>
            $"""<tr><td style="padding:4px 12px 4px 0;color:#6b7472;white-space:nowrap;">{WebUtility.HtmlEncode(r.Label)}</td><td style="padding:4px 0;">{WebUtility.HtmlEncode(r.Value)}</td></tr>"""));

        var sameNameWarning = clinicsWithSameName == 0
            ? ""
            : $"""<p style="margin:16px 0 0 0;color:#b45309;">⚠ {clinicsWithSameName} klinikë tjetër e regjistruar e mban të njëjtin emër.</p>""";

        var reviewHtml = reviewUrl is not null
            ? $"""<p style="margin:20px 0 0 0;"><a href="{WebUtility.HtmlEncode(reviewUrl)}" style="color:#12796e;">Shiko në panelin e rishikimit →</a></p>"""
            : """<p style="margin:20px 0 0 0;color:#6b7472;">Shiko në panelin SuperAdmin → Klinikat.</p>""";

        var html =
            EmailLayout.Paragraph("Një klinikë e re është paraqitur dhe pret rishikim.") +
            $"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#131718;">{tableRowsHtml}</table>""" +
            sameNameWarning +
            reviewHtml;

        var textRows = string.Join("\n", rawRows.Select(r => $"{r.Label}: {r.Value}"));
        var text = EmailLayout.WrapText(
            $"""
             Një klinikë e re është paraqitur dhe pret rishikim.

             {textRows}
             {(clinicsWithSameName == 0 ? "" : $"\nKujdes: {clinicsWithSameName} klinikë tjetër e regjistruar e mban të njëjtin emër.\n")}
             {(reviewUrl is not null ? $"Rishikimi: {reviewUrl}" : "Rishikimi: paneli SuperAdmin → Klinikat")}
             """,
            EmailLayout.DefaultFooter());

        return new EmailContent(subject, EmailLayout.Wrap(subject, html, EmailLayout.DefaultFooter()), text);
    }
}
