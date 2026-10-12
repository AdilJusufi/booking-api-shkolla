using Booking.Domain.Enums;

namespace Booking.Application.Common.Interfaces;

/// <summary>Rezultati i një kontrolli limiti — përdoret vetëm për log, kurrë nuk i kthehet klientit HTTP.</summary>
public enum EmailSendDecision
{
    Allowed,
    BlockedByCooldown,
    BlockedByAddressDailyLimit,
    BlockedByPurposeWindowLimit
}

/// <summary>
/// Vendos nëse një email "vetë-shërbyes" (rivendosje password-i, ridërgim konfirmimi)
/// duhet të dërgohet, dhe REGJISTRON tentativën nëse po — një thirrje e vetme bën të
/// dyja, që kontrolli dhe regjistrimi të mos ndahen kurrë gabimisht.
///
/// KUJDES thirrësi: rezultati këtu NUK duhet të ndryshojë përgjigjen HTTP në asnjë
/// mënyrë të dallueshme nga "email-i u dërgua" ose "adresa s'ekziston" — përndryshe
/// vetë kufizimi bëhet një kanal zbulimi (a ekziston kjo adresë, a është aktive).
/// Shih AuthService.ForgotPasswordAsync / ResendConfirmationEmailAsync.
/// </summary>
public interface IEmailAbuseGuard
{
    Task<EmailSendDecision> TryRecordSendAsync(
        string email, EmailSendPurpose purpose, string? ipAddress, CancellationToken cancellationToken = default);
}
