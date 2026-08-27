using Booking.Domain.Common;
using Booking.Domain.Enums;

namespace Booking.Domain.Entities;

/// <summary>
/// Një tentativë dërgimi email-i "vetë-shërbyes" (rivendosje password-i, ridërgim
/// konfirmimi) — përdoret VETËM për kufizimin e abuzimit (cooldown për-adresë, tavan
/// ditor për-adresë, tavan global ditor), jo si audit trail biznesi (shih AuditLog për
/// atë). I ndarë qëllimisht nga AuditLog: modeli i pyetjeve është ndryshe (numërim brenda
/// dritareve kohore për një adresë, jo kërkim sipas entiteti/useri), dhe këto rreshta
/// s'kanë vlerë si histori biznesi afatgjatë.
///
/// Rreshti shtohet VETËM kur vendoset të dërgohet (kontrollet e limitit kanë kaluar),
/// jo për çdo kërkesë HTTP — një kërkesë e refuzuar nga limiti nuk numërohet përsëri.
/// Append-only; asnjë UpdatedAt nuk nevojitet.
/// </summary>
public class EmailSendAttempt : BaseEntity
{
    /// <summary>Email-i i marrësit, i normalizuar (Trim + ToUpperInvariant) — çelësi i kërkimit për limitet për-adresë.</summary>
    public string NormalizedEmail { get; set; } = null!;

    public EmailSendPurpose Purpose { get; set; }

    /// <summary>IP-ja e kërkesës që e shkaktoi — vetëm për diagnostikim, jo pjesë e vendimit të limitit.</summary>
    public string? IpAddress { get; set; }

    public DateTime CreatedAt { get; set; }
}
