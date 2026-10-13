namespace Booking.Domain.Enums;

/// <summary>Përse u dërgua (ose u tentua) një email i kufizuar me kuotë — shih EmailSendAttempt.</summary>
public enum EmailSendPurpose
{
    PasswordReset = 1,
    EmailConfirmation = 2,

    /// <summary>Kujtesa ~24 orë para terminit — e dërguar nga sistemi, jo e kërkuar nga useri.</summary>
    AppointmentReminder = 3
}
