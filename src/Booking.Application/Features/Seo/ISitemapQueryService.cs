namespace Booking.Application.Features.Seo;

/// <summary>Një faqe publike që i përket sitemap-it: rruga në frontend (p.sh. "/mjeku/{id}") dhe data e ndryshimit të fundit.</summary>
public sealed record SitemapEntry(string Path, DateTime LastModifiedUtc);

/// <summary>
/// Faqet publike të profileve — të njëjtat kritere dukshmërie si faqet vetë (GetById), që sitemap-i
/// të mos premtojë kurrë një URL që kthen 404 (klinikë e pa-aprovuar/joaktive, doktor i paverifikuar).
/// </summary>
public interface ISitemapQueryService
{
    Task<IReadOnlyList<SitemapEntry>> GetProfileEntriesAsync(CancellationToken cancellationToken = default);
}
