using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Booking.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Notifications;

/// <summary>Konfigurimi i Resend — ApiKey vjen VETËM nga env vars ose user secrets, kurrë nga source code.</summary>
public sealed class ResendSettings
{
    public const string SectionName = "Resend";

    public string ApiKey { get; set; } = "";

    /// <summary>Formati i pranuar nga Resend: "Emri &lt;adresa@domain&gt;" ose thjesht "adresa@domain".</summary>
    public string FromAddress { get; set; } = "";
}

/// <summary>Dërgimi dështoi përfundimisht (jo-transient, ose transient pas gjithë riprovave).</summary>
public sealed class EmailSendException : Exception
{
    public EmailSendException(string message) : base(message)
    {
    }
}

/// <summary>
/// IEmailService real, mbi API-n REST të Resend (POST /emails, Bearer token). Zgjedhur
/// mbi SDK-në zyrtare: një thirrje e vetme HTTP nuk e arsyeton një varësi shtesë nën v1.0,
/// dhe një wrapper i hollë testohet direkt me një HttpMessageHandler të rremë.
///
/// Riprovon vetëm dështimet transiente (rrjeti/timeout, 5xx, 429) me backoff të shkurtër —
/// ky është rasti që arsyeton kompleksitetin: email-i i konfirmimit nuk ka rrugë tjetër
/// drejt userit nëse dështon fare. Një Idempotency-Key i qëndrueshëm përgjatë gjithë
/// riprovave parandalon dërgimin e dyfishtë nëse kërkesa e parë në fakt kishte arritur
/// te Resend por përgjigja humbi (p.sh. timeout në anën tonë).
/// </summary>
public class ResendEmailService : IEmailService
{
    private const int MaxAttempts = 3;
    private static readonly TimeSpan[] DefaultRetryDelays = [TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3)];

    private readonly HttpClient _httpClient;
    private readonly ResendSettings _settings;
    private readonly ILogger<ResendEmailService> _logger;
    private readonly IReadOnlyList<TimeSpan> _retryDelays;

    public ResendEmailService(HttpClient httpClient, IOptions<ResendSettings> settings, ILogger<ResendEmailService> logger)
        : this(httpClient, settings, logger, DefaultRetryDelays)
    {
    }

    /// <summary>
    /// Lejon vonesa riprove më të shkurtra në teste. E brendshme dhe jo publike qëllimisht:
    /// AddHttpClient&lt;T&gt; (ActivatorUtilities) hedh përjashtim nëse gjen MË SHUMË se një
    /// konstruktor publik që i përgjigjet HttpClient-it — nuk zgjedh më të mirin vetë.
    /// </summary>
    internal ResendEmailService(
        HttpClient httpClient, IOptions<ResendSettings> settings, ILogger<ResendEmailService> logger,
        IReadOnlyList<TimeSpan> retryDelays)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
        _retryDelays = retryDelays;
    }

    public async Task SendAsync(string toEmail, string subject, string htmlBody, string textBody, CancellationToken cancellationToken = default)
    {
        // I qëndrueshëm përgjatë gjithë riprovave të kësaj thirrjeje — shih rem. e klasës.
        var idempotencyKey = Guid.NewGuid().ToString();

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            HttpResponseMessage response;
            try
            {
                response = await SendOnceAsync(toEmail, subject, htmlBody, textBody, idempotencyKey, cancellationToken);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && attempt < MaxAttempts)
            {
                _logger.LogWarning(ex,
                    "Dërgimi i email-it te {ToEmail} (\"{Subject}\") dështoi në rrjet (tentativa {Attempt}/{MaxAttempts}) — po riprovoj.",
                    toEmail, subject, attempt, MaxAttempts);
                await Task.Delay(_retryDelays[attempt - 1], cancellationToken);
                continue;
            }

            if (response.IsSuccessStatusCode)
            {
                return;
            }

            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            var isTransient = (int)response.StatusCode >= 500 || response.StatusCode == HttpStatusCode.TooManyRequests;

            if (isTransient && attempt < MaxAttempts)
            {
                _logger.LogWarning(
                    "Dërgimi i email-it te {ToEmail} (\"{Subject}\") dështoi me {StatusCode} (tentativa {Attempt}/{MaxAttempts}) — po riprovoj. Përgjigja e Resend: {ErrorBody}",
                    toEmail, subject, (int)response.StatusCode, attempt, MaxAttempts, errorBody);
                await Task.Delay(_retryDelays[attempt - 1], cancellationToken);
                continue;
            }

            _logger.LogError(
                "Dërgimi i email-it te {ToEmail} (\"{Subject}\") dështoi përfundimisht me {StatusCode}. Përgjigja e Resend: {ErrorBody}",
                toEmail, subject, (int)response.StatusCode, errorBody);
            throw new EmailSendException(
                $"Resend ktheu {(int)response.StatusCode} duke dërguar te {toEmail} (\"{subject}\"): {errorBody}");
        }

        // E paarritshme: çdo iterim ose kthehet, ose hedh, ose vazhdon te tentativa tjetër;
        // vetëm tentativa e fundit mund të "bjerë tej" loop-it, dhe atje isTransient && attempt
        // < MaxAttempts është gjithmonë false, kështu që throw-i më lart e kap përpara se të dalim.
        throw new UnreachableException();
    }

    private async Task<HttpResponseMessage> SendOnceAsync(
        string toEmail, string subject, string htmlBody, string textBody, string idempotencyKey, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "emails")
        {
            // Të dyja fushat gjithmonë: html për shfaqje, text si alternativë — shih
            // koment mbi IEmailService. Më parë dërgohej vetëm "text", pra çdo email
            // deri tani ka mbërritur si tekst i papërpunuar, pavarësisht markup-ut të
            // ndërtuar nga thirrësi.
            Content = JsonContent.Create(new
            {
                from = _settings.FromAddress,
                to = new[] { toEmail },
                subject,
                html = htmlBody,
                text = textBody
            })
        };
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey);

        return await _httpClient.SendAsync(request, cancellationToken);
    }
}
