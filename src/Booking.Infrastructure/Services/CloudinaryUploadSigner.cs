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
/// Dosja ndërtohet GJITHMONË në server nga CloudinaryFolders (rrënja e mjedisit + shtegu i entitetit),
/// kurrë nga klienti; public_id është fiks ("current") me overwrite+invalidate. Formatet dhe kufiri i
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

    /// <param name="relativeFolder">Nga <see cref="CloudinaryFolders"/> (p.sh. DoctorPhoto(id)); rrënja shtohet këtu.</param>
    public CloudinarySignatureDto Sign(string relativeFolder, IReadOnlyCollection<string> allowedFormats, long maxFileSizeBytes)
    {
        EnsureConfigured();
        var folder = CloudinaryFolders.Combine(_settings.RootFolder, relativeFolder);

        var timestamp = new DateTimeOffset(_dateTimeProvider.UtcNow, TimeSpan.Zero).ToUnixTimeSeconds();
        var formats = string.Join(',', allowedFormats);
        var paramsToSign = CloudinaryUploadSignature.BuildParamsToSign(
            formats, folder, CloudinaryFolders.PublicId, maxFileSizeBytes, timestamp);

        return new CloudinarySignatureDto
        {
            Signature = CloudinaryUploadSignature.Compute(paramsToSign, _settings.ApiSecret),
            Timestamp = timestamp,
            ApiKey = _settings.ApiKey,
            CloudName = _settings.CloudName,
            Folder = folder,
            AllowedFormats = formats,
            MaxFileSizeBytes = maxFileSizeBytes,
            PublicId = CloudinaryFolders.PublicId
        };
    }

    /// <summary>
    /// True vetëm për një URL dorëzimi të një imazhi në cloud-in TONË, në dosjen e këtij mjedisi
    /// dhe të këtij entiteti, me public_id "current":
    /// https://res.cloudinary.com/{cloud}/image/upload/v{digits}/{RootFolder}/{relativeFolder}/current.{ext}.
    /// Pa këtë, një përdorues që ka të drejtë ta ndryshojë foton mund të vendoste çfarëdo URL
    /// (një imazh i huaj, një gjurmues, foton e një mjeku tjetër, një imazh të mjedisit tjetër).
    /// </summary>
    public bool IsOwnImageUrl(string url, string relativeFolder, IReadOnlyCollection<string> allowedFormats)
    {
        EnsureConfigured();
        var folder = CloudinaryFolders.Combine(_settings.RootFolder, relativeFolder);

        var pattern =
            "^https://res\\.cloudinary\\.com/" + Regex.Escape(_settings.CloudName)
            + "/image/upload/v\\d+/" + Regex.Escape(folder)
            + "/" + Regex.Escape(CloudinaryFolders.PublicId)
            + "\\.(?:" + string.Join('|', allowedFormats.Select(Regex.Escape)) + ")$";

        return Regex.IsMatch(url, pattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    }

    private void EnsureConfigured()
    {
        var missing = new (string Name, string Value)[]
            {
                ("Cloudinary__CloudName", _settings.CloudName),
                ("Cloudinary__ApiKey", _settings.ApiKey),
                ("Cloudinary__ApiSecret", _settings.ApiSecret),
                ("Cloudinary__RootFolder", _settings.RootFolder)
            }
            .Where(s => string.IsNullOrWhiteSpace(s.Value))
            .Select(s => s.Name)
            .ToList();

        if (missing.Count == 0)
        {
            if (CloudinaryFolders.IsValidRoot(_settings.RootFolder))
            {
                return;
            }

            // Rrënja e pavlefshme trajtohet si mungesë konfigurimi: s'bie kurrë te rrënja e llogarisë.
            _logger.LogError(
                "Cloudinary__RootFolder është i pavlefshëm (lejohet vetëm a-z, 0-9, \"-\" dhe \"/\" mes segmenteve, " +
                "p.sh. \"rezervomjekun/dev\"; pa \"..\", pa \"/\" në fillim ose në fund). Ngarkimi i imazheve " +
                "refuzohet me 503 derisa të korrigjohet.");
            throw new UploadsNotConfiguredException();
        }

        // Vetëm EMRAT e variablave që mungojnë — asnjëherë vlerat.
        _logger.LogError(
            "Cloudinary nuk është konfiguruar: mungojnë {MissingSettings}. Ngarkimi i imazheve " +
            "(logo e klinikës, foto e mjekut) refuzohet me 503 derisa këto të vendosen në mjedis.",
            string.Join(", ", missing));
        throw new UploadsNotConfiguredException();
    }
}
