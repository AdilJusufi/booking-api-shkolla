using Booking.Domain.Enums;

namespace Booking.Application.Common.Models;

/// <summary>
/// Kufijtë e abuzimit për email-et "vetë-shërbyese" (rivendosje password-i, ridërgim
/// konfirmimi) — të vetmet dy endpoint-e publike që e lënë një jashtë-autentikuar të
/// zgjedhë kë të marrë email dhe kur. Tre shtresa, asnjë e mjaftueshme e vetme:
/// cooldown-i për-adresë mbron një person konkret nga bombardimi; tavani ditor
/// për-adresë e mban të njëjtën mbrojtje edhe nëse dikush qëllon ta anashkalojë
/// cooldown-in me shumë IP; tavani global mbron vetë buxhetin e Resend nga
/// konsumimi total (enumerim adresash), i cili përndryshe do të prishte edhe
/// rivendosjen e password-it për të gjithë të tjerët. Ajo shtresë e tretë tani është
/// e ndarë sipas qëllimit dhe mbi një dritare rrëshqitëse, jo një kovë e vetme deri në mesnatë.
/// </summary>
public sealed class EmailAbuseLimitSettings
{
    public const string SectionName = "EmailAbuseLimits";

    /// <summary>Sa minuta pritje mes dy email-esh "vetë-shërbyes" për të NJËJTËN adresë (të dy qëllimet bashkë).</summary>
    public int PerAddressCooldownMinutes { get; set; } = 2;

    /// <summary>
    /// Tavani për një adresë të vetme, pavarësisht qëllimit. Mbetet i llogaritur mbi ditën
    /// kalendarike UTC: prek një adresë të vetme, ndaj "pritja deri në mesnatë" këtu s'ka
    /// pasojë mbi platformën — ndryshe nga tavani për-qëllim më poshtë, ku pikërisht ajo
    /// pritje ishte problemi.
    /// </summary>
    public int PerAddressDailyLimit { get; set; } = 5;

    /// <summary>
    /// Gjatësia e dritares rrëshqitëse për tavanet për-qëllim. Dritare rrëshqitëse dhe jo
    /// "që nga mesnata UTC": me numërim kalendarik, një shpërthim i vetëm në orën 00:05 i
    /// mbante email-et të bllokuara për ~24 orë, deri në një kufi arbitrar të sahatit. Me
    /// dritare rrëshqitëse, kapaciteti kthehet gradualisht sapo tentativat e vjetra dalin
    /// nga dritarja — pa asnjë çast privilegjuar.
    /// </summary>
    public int PurposeWindowHours { get; set; } = 24;

    /// <summary>
    /// Tavani për QËLLIM brenda dritares, jo një kovë e vetme e përbashkët. Ndarja është
    /// vetë qëllimi: me një numërues të vetëm, ridërgimet e konfirmimit mund ta hanin gjithë
    /// buxhetin dhe të bllokonin rivendosjen e password-it për të gjithë — dy nevoja krejt
    /// të palidhura që konkurronin për të njëjtin numër.
    ///
    /// Përmasat, kundër kuotës reale të Resend prej 100 email/ditë:
    ///   • PasswordReset      25 — nevoja legjitime më e shpeshtë dhe më urgjente; të mbetesh
    ///                             jashtë llogarisë mjekësore nuk pret dot.
    ///   • EmailConfirmation  15 — vetëm gjatë regjistrimit, dhe konfirmimi i PARË dërgohet
    ///                             tashmë nga rruga e regjistrimit; ky është rrjeta e dytë.
    ///   • AppointmentReminder 30 — kujtesat ~24h para terminit (AppointmentReminderService).
    ///                             Kovë e veçantë që një ditë e ngarkuar me kujtesa të mos e
    ///                             hajë buxhetin e rivendosjes/konfirmimit brenda këtij guard-i.
    ///                             Kujtesat që s'kanë vend mbeten të pashënuara dhe dalin në
    ///                             ekzekutimin e radhës, sapo dritarja të lirohet.
    ///   • ~30 mbeten të pazëna — konfirmimet e regjistrimit, njoftimet e klinikave dhe ato të
    ///     termineve (rezervim/anulim) e shpenzojnë TË NJËJTËN kuotë Resend pa kaluar nga ky
    ///     guard (shih IEmailAbuseGuard). KUJDES: tavanet këtu janë kufij sipër, jo rezervime —
    ///     ndarja mbron qëllimet nga njëri-tjetri BRENDA guard-it, por jo nga kuota reale e
    ///     Resend. Në një ditë me 30 kujtesa dhe shumë rezervime, Resend mund ta kalojë 100-shin
    ///     dhe të refuzojë edhe një rivendosje. Zgjidhja e vërtetë atëherë është plani i paguar
    ///     i Resend, jo shtrëngimi i këtyre numrave.
    /// </summary>
    public Dictionary<EmailSendPurpose, int> PurposeWindowLimits { get; set; } = new()
    {
        [EmailSendPurpose.PasswordReset] = 25,
        [EmailSendPurpose.EmailConfirmation] = 15,
        [EmailSendPurpose.AppointmentReminder] = 30,
    };

    /// <summary>
    /// Kufiri për një qëllim që s'gjendet te <see cref="PurposeWindowLimits"/>. Ekziston që
    /// shtimi i një EmailSendPurpose të ri të mos hapet pa kufi nga harresa: pa këtë, një
    /// qëllim i pakonfiguruar do të ishte i pakufizuar — dështim i hapur pikërisht atje ku
    /// i gjithë komponenti bën fjalë për kufizim.
    /// </summary>
    public int DefaultPurposeWindowLimit { get; set; } = 10;
}
