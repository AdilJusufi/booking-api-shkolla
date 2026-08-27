namespace Booking.Domain.Enums;

/// <summary>Përse u dërgua (ose u tentua) një email "vetë-shërbyes" — shih EmailSendAttempt.</summary>
public enum EmailSendPurpose
{
    PasswordReset = 1,
    EmailConfirmation = 2
}
