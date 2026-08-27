namespace Booking.Application.Common.Models;

/// <summary>
/// Kufijtë e abuzimit për email-et "vetë-shërbyese" (rivendosje password-i, ridërgim
/// konfirmimi) — të vetmet dy endpoint-e publike që e lënë një jashtë-autentikuar të
/// zgjedhë kë të marrë email dhe kur. Tre shtresa, asnjë e mjaftueshme e vetme:
/// cooldown-i për-adresë mbron një person konkret nga bombardimi; tavani ditor
/// për-adresë e mban të njëjtën mbrojtje edhe nëse dikush qëllon ta anashkalojë
/// cooldown-in me shumë IP; tavani global mbron vetë buxhetin e Resend nga
/// konsumimi total (enumerim adresash), i cili përndryshe do të prishte edhe
/// rivendosjen e password-it për të gjithë të tjerët.
/// </summary>
public sealed class EmailAbuseLimitSettings
{
    public const string SectionName = "EmailAbuseLimits";

    /// <summary>Sa minuta pritje mes dy email-esh "vetë-shërbyes" për të NJËJTËN adresë (të dy qëllimet bashkë).</summary>
    public int PerAddressCooldownMinutes { get; set; } = 2;

    /// <summary>Tavani ditor për një adresë të vetme, pavarësisht qëllimit.</summary>
    public int PerAddressDailyLimit { get; set; } = 5;

    /// <summary>
    /// Tavani ditor GLOBAL për këto dy endpoint-e (jo për gjithë trafikun e email-eve
    /// të aplikacionit — konfirmimet e regjistrimit dhe njoftimet e klinikave s'numërohen
    /// këtu). Duhet vendosur qartazi nën kuotën reale të Resend, me hapësirë të
    /// mjaftueshme për trafikun tjetër që e ndan të njëjtën llogari Resend.
    /// </summary>
    public int GlobalDailyLimit { get; set; } = 40;
}
