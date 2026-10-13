using Booking.Application.Common.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Notifications;

/// <summary>
/// Ekzekuton AppointmentReminderService një herë pak pas nisjes dhe pastaj çdo
/// Reminders:IntervalMinutes. Ekzekutimi i parë pas nisjes është ai që e bën punën të
/// qëndrueshme ndaj gjumit të Render-it: procesi zgjohet nga një kërkesë, dhe brenda
/// ~30 sekondave dërgohen kujtesat që mbetën gjatë gjumit (shih ComputeWindow).
/// Çdo ekzekutim ka scope-in e vet (DbContext i freskët) dhe një dështim s'e ndal ciklin.
/// </summary>
public sealed class AppointmentReminderBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ReminderSettings _settings;
    private readonly ILogger<AppointmentReminderBackgroundService> _logger;
    private ReminderRunOutcome? _lastLoggedSkip;

    public AppointmentReminderBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<ReminderSettings> settings,
        ILogger<AppointmentReminderBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _settings = settings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_settings.Enabled)
        {
            _logger.LogInformation("Kujtesat e termineve janë të çaktivizuara (Reminders:Enabled=false).");
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(_settings.StartupDelaySeconds), stoppingToken);

            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(_settings.IntervalMinutes));
            do
            {
                await RunSafeAsync(stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Mbyllje normale e procesit.
        }
    }

    private async Task RunSafeAsync(CancellationToken stoppingToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<AppointmentReminderService>();
            var result = await service.RunOnceAsync(stoppingToken);

            // "Log një herë": pa këtë, mungesa e çelësit Resend në zhvillim do të shkruante
            // të njëjtin rresht çdo 15 minuta.
            if (result.Outcome == ReminderRunOutcome.NoEmailProvider && _lastLoggedSkip != result.Outcome)
            {
                _logger.LogInformation(
                    "Kujtesat e termineve: s'ka Resend:ApiKey/FromAddress — asnjë kujtesë s'dërgohet dhe asnjë " +
                    "termin s'shënohet si i kujtuar. (Normale në zhvillim.)");
            }

            _lastLoggedSkip = result.Outcome;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ekzekutimi i kujtesave të termineve dështoi — do të provohet sërish pas {Minutes} minutash.",
                _settings.IntervalMinutes);
        }
    }
}
