namespace Booking.Application.Common.Models;

/// <summary>
/// Të dhënat që frontend-i i duhen për të ngarkuar drejtpërdrejt te Cloudinary
/// me një signed upload — API secret-i mbetet vetëm në backend.
/// </summary>
public sealed record CloudinarySignatureDto
{
    public required string Signature { get; init; }
    public required long Timestamp { get; init; }
    public required string ApiKey { get; init; }
    public required string CloudName { get; init; }
    public required string Folder { get; init; }

    /// <summary>
    /// Lista e formateve (p.sh. "png,jpg,jpeg,webp") dhe kufiri i madhësisë, të dyja
    /// PJESË E NËNSHKRIMIT. Klienti duhet t'i dërgojë saktësisht ashtu siç i mori te
    /// kërkesa drejt Cloudinary-t — nëse i ndryshon ose i lë jashtë, nënshkrimi s'përputhet
    /// dhe ngarkimi refuzohet. Prandaj kthehen këtu: nuk janë sugjerime për UI-në, janë
    /// vlera që duhet të udhëtojnë bashkë me nënshkrimin.
    /// </summary>
    public required string AllowedFormats { get; init; }

    public required long MaxFileSizeBytes { get; init; }
}
