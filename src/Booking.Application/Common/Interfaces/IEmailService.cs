namespace Booking.Application.Common.Interfaces;

/// <summary>
/// Dërgimi i email-eve. HTML dhe text janë TË DYJA të detyrueshme, jo opsionale: Resend
/// (dhe email klientë të mirë-sjellshëm) i duan të dyja në çdo dërgim — HTML për shfaqje,
/// text si alternativë kur klienti/useri e preferon, dhe si sinjal antispam (email vetëm
/// HTML trajtohet me më shumë dyshim nga filtrat). Kurrë mos e ndërto njërin nga tjetri
/// automatikisht (p.sh. duke hequr tag-et HTML) — shih EmailTemplates për ndërtimin e
/// përbashkët të të dyjave nga të njëjtat të dhëna burimore.
/// </summary>
public interface IEmailService
{
    Task SendAsync(string toEmail, string subject, string htmlBody, string textBody, CancellationToken cancellationToken = default);
}

/// <summary>
/// Dërgimi i SMS-ve. Në V1 vetëm logon; e gatshme për Twilio ose një operator lokal në Kosovë.
/// </summary>
public interface ISmsService
{
    Task SendAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default);
}
