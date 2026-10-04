namespace Booking.Infrastructure.Services;

/// <summary>Konfigurimi i Cloudinary — ApiSecret vjen VETËM nga env vars ose user secrets, kurrë nga source code.</summary>
public sealed class CloudinarySettings
{
    public const string SectionName = "Cloudinary";

    public string CloudName { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string ApiSecret { get; set; } = "";

    /// <summary>
    /// E DETYRUESHME, pa vlerë parazgjedhje (p.sh. "rezervomjekun/prod", "rezervomjekun/dev"). Nëse mungon
    /// ose është e pavlefshme, ngarkimet kthejnë 503 — kurrë rënie te rrënja e llogarisë, sepse
    /// pikërisht kështu përzihen mjediset. Formati: shih CloudinaryFolders.
    /// </summary>
    public string RootFolder { get; set; } = "";
}
