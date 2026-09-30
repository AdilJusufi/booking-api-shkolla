using System.Text.RegularExpressions;
using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Services;

/// <summary>
/// E vetmja pikë ku lëshohen nënshkrime Cloudinary dhe ku verifikohen URL-të që kthehen
/// pas ngarkimit — e përbashkët për logon e klinikës dhe foton e mjekut.
///
/// Dosja caktohet GJITHMONË nga thirrësi në server (p.sh. "doctors/{doctorId}/photo"),
/// kurrë nga klienti; klienti s'dërgon as folder as public_id. Formatet dhe kufiri i
/// madhësisë hyjnë në nënshkrim, kështu që Cloudinary i zbaton vetë.
/// </summary>
public sealed class CloudinaryUploadSigner
{
    private readonly CloudinarySettings _settings;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<CloudinaryUploadSigner> _logger;

    public CloudinaryUploadSigner(
        IOptions<CloudinarySettings> settings,
        IDateTimeProvider dateTimeProvider,
        ILogger<CloudinaryUploadSigner> logger)
    {
        _settings = settings.Value;
        _dateTimeProvider = dateTimeProvider;
        _logger = logger;
    }

    public CloudinarySignatureDto Sign(string folder, IReadOnlyCollection<string> allowedFormats, long maxFileSizeBytes)
    {
        EnsureConfigured();

        var timestamp = new DateTimeOffset(_dateTimeProvider.UtcNow, TimeSpan.Zero).ToUnixTimeSeconds();
        var formats = string.Join(',', allowedFormats);
        var paramsToSign = CloudinaryUploadSignature.BuildParamsToSign(formats, folder, maxFileSizeBytes, timestamp);

        return new CloudinarySignatureDto
        {
            Signature = CloudinaryUploadSignature.Compute(paramsToSign, _settings.ApiSecret),
            Timestamp = timestamp,
            ApiKey = _settings.ApiKey,
            CloudName = _settings.CloudName,
            Folder = folder,
            AllowedFormats = formats,
            MaxFileSizeBytes = maxFileSizeBytes
        };
    }

    /// <summary>
    /// True vetëm për një URL dorëzimi të një imazhi në cloud-in TONË dhe DREJTPËRDREJT në
    /// <paramref name="folder"/>: https://res.cloudinary.com/{cloud}/image/upload/[v123/]{folder}/{id}.{ext}.
    /// Pa këtë, një përdorues që ka të drejtë ta ndryshojë foton mund të vendoste çfarëdo URL
    /// (një imazh i huaj, një gjurmues, foton e një mjeku tjetër) duke anashkaluar ngarkimin.
    /// </summary>
    public bool IsOwnImageUrl(string url, string folder, IReadOnlyCollection<string> allowedFormats)
    {
        EnsureConfigured();

        var pattern =
            "^https://res\\.cloudinary\\.com/" + Regex.Escape(_settings.CloudName)
            + "/image/upload/(?:v\\d+/)?" + Regex.Escape(folder)
            + "/[A-Za-z0-9_-]+\\.(?:" + string.Join('|', allowedFormats.Select(Regex.Escape)) + ")$";

        return Regex.IsMatch(url, pattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    }

    private void EnsureConfigured()
    {
        var missing = new (string Name, string Value)[]
            {
                ("Cloudinary__CloudName", _settings.CloudName),
                ("Cloudinary__ApiKey", _settings.ApiKey),
                ("Cloudinary__ApiSecret", _settings.ApiSecret)
            }
            .Where(s => string.IsNullOrWhiteSpace(s.Value))
            .Select(s => s.Name)
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        // Vetëm EMRAT e variablave që mungojnë — asnjëherë vlerat.
        _logger.LogError(
            "Cloudinary nuk është konfiguruar: mungojnë {MissingSettings}. Ngarkimi i imazheve " +
            "(logo e klinikës, foto e mjekut) refuzohet me 503 derisa këto të vendosen në mjedis.",
            string.Join(", ", missing));
        throw new UploadsNotConfiguredException();
    }
}
