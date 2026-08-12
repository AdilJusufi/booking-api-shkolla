namespace Booking.Infrastructure.Services;

/// <summary>Konfigurimi i Cloudinary — ApiSecret vjen VETËM nga env vars ose user secrets, kurrë nga source code.</summary>
public sealed class CloudinarySettings
{
    public const string SectionName = "Cloudinary";

    public string CloudName { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string ApiSecret { get; set; } = "";
}
