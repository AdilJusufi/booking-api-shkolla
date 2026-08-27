using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Clinics;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Notifications;

/// <summary>
/// V1: njoftimet e klinikave shkojnë përmes IEmailService, që sot vetëm logon.
/// Përmbajtja dhe marrësit janë realë — mjafton të regjistrohet një IEmailService
/// me SMTP/SendGrid dhe email-at nisen pa asnjë ndryshim këtu.
/// </summary>
public class LoggingClinicNotificationService : IClinicNotificationService
{
    private readonly BookingDbContext _dbContext;
    private readonly IEmailService _emailService;
    private readonly FrontendSettings _frontendSettings;
    private readonly ILogger<LoggingClinicNotificationService> _logger;

    public LoggingClinicNotificationService(
        BookingDbContext dbContext,
        IEmailService emailService,
        IOptions<FrontendSettings> frontendSettings,
        ILogger<LoggingClinicNotificationService> logger)
    {
        _dbContext = dbContext;
        _emailService = emailService;
        _frontendSettings = frontendSettings.Value;
        _logger = logger;
    }

    public async Task ClinicRegisteredAsync(
        ClinicRegistrationNotificationContext context, CancellationToken cancellationToken = default)
    {
        var recipients = await GetSuperAdminEmailsAsync(cancellationToken);
        if (recipients.Count == 0)
        {
            // Pa marrës njoftimi humbet në heshtje — dhe bashkë me të edhe rishikimi.
            _logger.LogWarning(
                "Klinika {ClinicId} pret aprovim por s'u gjet asnjë SuperAdmin aktiv për ta njoftuar.",
                context.ClinicId);
            return;
        }

        var reviewLink = BuildLink(_frontendSettings.SuperAdminClinicsPath);
        var body =
            $"""
             Një klinikë e re është paraqitur dhe pret rishikim.

             Klinika: {context.ClinicName}
             ID: {context.ClinicId}
             Telefoni: {Or(context.ClinicPhoneNumber)}
             Email: {Or(context.ClinicEmail)}
             Web: {Or(context.Website)}
             Qytetet e degëve: {(context.BranchCities.Count == 0 ? "—" : string.Join(", ", context.BranchCities))}

             Mbajtësi i llogarisë: {context.AdminFullName}
             Email: {context.AdminEmail}
             Telefoni: {Or(context.AdminPhoneNumber)}

             Paraqitur më: {context.SubmittedAtUtc:dd.MM.yyyy HH:mm} UTC
             {SameNameNote(context)}
             Rishikimi: {reviewLink ?? $"paneli SuperAdmin → Klinikat (ID {context.ClinicId})"}
             """;

        _logger.LogInformation(
            "Njoftim regjistrimi klinike {ClinicId} për {RecipientCount} SuperAdmin",
            context.ClinicId, recipients.Count);

        foreach (var recipient in recipients)
        {
            await _emailService.SendAsync(recipient, "Klinikë e re në pritje të aprovimit", body, cancellationToken);
        }
    }

    public async Task ClinicRegistrationReceivedAsync(
        ClinicRegistrationNotificationContext context, CancellationToken cancellationToken = default)
    {
        var myClinicsLink = BuildLink(_frontendSettings.MyClinicsPath);
        var body =
            $"""
             Përshëndetje {context.AdminFullName},

             Aplikimi juaj për klinikën "{context.ClinicName}" u pranua dhe është në rishikim.

             Deri sa ekipi ynë ta verifikojë, klinika nuk shfaqet në kërkimin publik dhe
             menaxhimi i degëve, shërbimeve dhe mjekëve mbetet i mbyllur. Mund të kyçeni
             që tani dhe do ta shihni klinikën në gjendjen "Në pritje".
             {(myClinicsLink is null ? string.Empty : $"\n{myClinicsLink}\n")}
             Do t'ju njoftojmë me email sapo rishikimi të përfundojë.
             """;

        _logger.LogInformation("Konfirmim paraqitjeje për klinikën {ClinicId}", context.ClinicId);

        await _emailService.SendAsync(
            context.AdminEmail, "Klinika juaj është në rishikim", body, cancellationToken);
    }

    public async Task ClinicApprovedAsync(
        ClinicApprovedNotificationContext context, CancellationToken cancellationToken = default)
    {
        if (context.AdminEmails.Count == 0)
        {
            return;
        }

        var myClinicsLink = BuildLink(_frontendSettings.MyClinicsPath);
        var body =
            $"""
             Klinika "{context.ClinicName}" u aprovua.

             Që tani ajo shfaqet në kërkimin publik dhe mund të menaxhoni degët,
             shërbimet dhe mjekët e saj.
             {(myClinicsLink is null ? string.Empty : $"\n{myClinicsLink}")}
             """;

        _logger.LogInformation("Njoftim aprovimi për klinikën {ClinicId}", context.ClinicId);

        foreach (var recipient in context.AdminEmails)
        {
            await _emailService.SendAsync(recipient, "Klinika juaj u aprovua", body, cancellationToken);
        }
    }

    /// <summary>
    /// Filtrimi bëhet në DB përmes tabelave të Identity — njësoj si te
    /// SuperAdminService.GetUsersAsync, pa ngarkuar userat në memorie.
    /// </summary>
    private async Task<IReadOnlyList<string>> GetSuperAdminEmailsAsync(CancellationToken cancellationToken) =>
        await _dbContext.Users
            .Where(u => u.IsActive
                        && u.Email != null
                        && _dbContext.UserRoles.Any(ur =>
                            ur.UserId == u.Id
                            && _dbContext.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.SuperAdmin)))
            .Select(u => u.Email!)
            .ToListAsync(cancellationToken);

    private string? BuildLink(string path)
    {
        var baseUrl = _frontendSettings.BaseUrl?.TrimEnd('/');
        return string.IsNullOrWhiteSpace(baseUrl) ? null : baseUrl + path;
    }

    private static string Or(string? value) => string.IsNullOrWhiteSpace(value) ? "—" : value;

    private static string SameNameNote(ClinicRegistrationNotificationContext context) =>
        context.ClinicsWithSameName == 0
            ? string.Empty
            : $"\nKujdes: {context.ClinicsWithSameName} klinikë tjetër e regjistruar e mban të njëjtin emër.\n";
}
