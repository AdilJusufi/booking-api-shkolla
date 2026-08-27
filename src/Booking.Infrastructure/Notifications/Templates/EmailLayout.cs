using System.Net;

namespace Booking.Infrastructure.Notifications.Templates;

/// <summary>
/// I gjithi HTML-i i email-eve — trupi i mesazhit, jo çdo pjesë e tij — përdor markup
/// tabelash dhe stil inline QËLLIMISHT. Klientët e email-it (Outlook desktop, Gmail web,
/// shumica e klientëve mobile) renderojnë motorë të vjetër: flexbox/grid nuk mbështeten
/// gjerësisht, &lt;style&gt; hiqet nga Gmail, dhe JavaScript/web-fonts s'ekzistojnë fare.
/// Trajtoje këtë skedar si HTML të vitit 2005, jo si zhvillim modern web-i.
///
/// Ngjyrat vijnë nga tokenat e markës (shih frontend/src/styles/index.css: --ink,
/// --muted, --bg, --surface) që identiteti vizual të përputhet me aplikacionin.
/// Kurrë #000/#fff të pastra — disa klientë (Gmail dark mode veçanërisht) i trajtojnë
/// ato si sinjal për "ktheji ngjyrat", dhe #131718/#ffffff e shmangin pjesërisht këtë.
/// Meta color-scheme/supported-color-schemes u thonë klientëve që e respektojnë
/// (Apple Mail, Outlook.com) të mos e aplikojnë fare dark mode automatik këtu — testuar
/// manualisht vetëm në Gmail dhe Apple Mail, shih raportin për klientët e patestuar.
/// </summary>
public static class EmailLayout
{
    private const string Ink = "#131718";
    private const string Muted = "#6b7472";
    private const string PageBg = "#f7f8f8";
    private const string CardBg = "#ffffff";
    private const string Brand = "#12796e";
    private const string BorderColor = "#eef0f0";
    private const string FontStack = "Arial, Helvetica, sans-serif";

    /// <summary>Mbështjell përmbajtjen (tashmë HTML) në faqen e plotë të email-it: header + kartelë + footer.</summary>
    public static string Wrap(string title, string contentHtml, string footerHtml)
    {
        var encodedTitle = WebUtility.HtmlEncode(title);
        return $"""
            <!DOCTYPE html>
            <html lang="sq">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="color-scheme" content="light">
            <meta name="supported-color-schemes" content="light">
            <title>{encodedTitle}</title>
            </head>
            <body style="margin:0;padding:0;background-color:{PageBg};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{PageBg};">
            <tr>
            <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:{CardBg};border-radius:12px;">
            <tr>
            <td style="padding:28px 32px 20px 32px;border-bottom:1px solid {BorderColor};">
            <span style="font-family:{FontStack};font-size:20px;font-weight:700;color:{Ink};">Rezervo <span style="color:{Brand};">Mjekun</span></span>
            </td>
            </tr>
            <tr>
            <td style="padding:32px;font-family:{FontStack};font-size:15px;line-height:1.6;color:{Ink};">
            {contentHtml}
            </td>
            </tr>
            <tr>
            <td style="padding:20px 32px 28px 32px;border-top:1px solid {BorderColor};font-family:{FontStack};font-size:12px;line-height:1.6;color:{Muted};">
            {footerHtml}
            </td>
            </tr>
            </table>
            </td>
            </tr>
            </table>
            </body>
            </html>
            """;
    }

    /// <summary>Buton i madh: qelizë tabele me sfond të ngjyrosur, jo &lt;button&gt; — disa klientë e injorojnë "button" krejtësisht.</summary>
    public static string Button(string url, string label)
    {
        var encodedUrl = WebUtility.HtmlEncode(url);
        var encodedLabel = WebUtility.HtmlEncode(label);
        return $"""
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
            <tr>
            <td align="center" bgcolor="{Brand}" style="border-radius:8px;background-color:{Brand};">
            <a href="{encodedUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:{FontStack};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">{encodedLabel}</a>
            </td>
            </tr>
            </table>
            """;
    }

    /// <summary>
    /// URL-ja e dukshme nën buton — disa klientë e heqin ose e prishin butonin, dhe disa
    /// përdorues janë të kujdesshëm ndaj butonave në email pa ditur ku çojnë realisht.
    /// </summary>
    public static string FallbackUrlBlock(string url)
    {
        var encodedUrl = WebUtility.HtmlEncode(url);
        return $"""
            <p style="margin:4px 0 0 0;font-family:{FontStack};font-size:12px;color:{Muted};line-height:1.6;">
            Nëse butoni nuk funksionon, kopjoni këtë adresë në shfletuesin tuaj:<br>
            <a href="{encodedUrl}" style="color:{Brand};word-break:break-all;">{encodedUrl}</a>
            </p>
            """;
    }

    public static string Paragraph(string text) =>
        $"""<p style="margin:0 0 16px 0;">{WebUtility.HtmlEncode(text)}</p>""";

    /// <summary>Shënim i vogël, i zbehtë — për afatin e skadimit ose paralajmërime dytësore brenda trupit.</summary>
    public static string MutedNote(string text) =>
        $"""<p style="margin:16px 0 0 0;font-family:{FontStack};font-size:13px;color:{Muted};line-height:1.5;">{WebUtility.HtmlEncode(text)}</p>""";

    public static string DefaultFooter(string extra = "") =>
        $"""
        Ky email u dërgua nga Rezervo Mjekun.{(string.IsNullOrEmpty(extra) ? "" : " " + WebUtility.HtmlEncode(extra))}
        """;

    /// <summary>
    /// Alternativa e thjeshtë-tekst — dërgohet GJITHMONË bashkë me HTML-in (fusha "text"
    /// e Resend). Disa klientë/përdorues e preferojnë, dhe filtrat e spam-it trajtojnë
    /// email-in vetëm-HTML me më shumë dyshim. Përmban TË NJËJTËN URL, të qartë.
    /// </summary>
    public static string WrapText(string contentText, string footerText) =>
        $"""
        REZERVO MJEKUN
        ————————————————

        {contentText.Trim()}

        ————————————————
        {footerText.Trim()}
        """;

    /// <summary>Ekuivalenti tekst i Button+FallbackUrlBlock — vetëm URL-ja, e qartë dhe e plotë.</summary>
    public static string TextLink(string label, string url) => $"{label}\n{url}";
}
