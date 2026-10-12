using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Booking.Application.Common.Models;
using Booking.Application.Features.Seo;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Booking.Api.Controllers;

/// <summary>
/// sitemap.xml për Google. URL-të janë ato të FRONTEND-it (Frontend:BaseUrl), jo të API-t —
/// Vercel e përcjell /sitemap.xml këtu (shih frontend/vercel.json), kështu që sitemap-i është
/// gjithmonë i freskët (klinikë e re e aprovuar shfaqet pa ri-deploy të frontend-it).
/// </summary>
[ApiController]
[AllowAnonymous]
public class SitemapController : ControllerBase
{
    /// <summary>Faqet statike publike; profilet vijnë nga databaza.</summary>
    private static readonly string[] StaticPaths = ["/", "/kerko", "/politika-e-privatesise", "/kushtet-e-perdorimit"];

    private readonly ISitemapQueryService _sitemapQueryService;
    private readonly FrontendSettings _frontend;

    public SitemapController(ISitemapQueryService sitemapQueryService, IOptions<FrontendSettings> frontend)
    {
        _sitemapQueryService = sitemapQueryService;
        _frontend = frontend.Value;
    }

    [HttpGet("/sitemap.xml")]
    [Produces("application/xml")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var baseUrl = _frontend.BaseUrl?.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            // Pa adresën e frontend-it s'mund të ndërtohet asnjë URL e vlefshme — më mirë asgjë se URL të gabuara.
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        var entries = await _sitemapQueryService.GetProfileEntriesAsync(cancellationToken);

        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var urlset = new XElement(ns + "urlset",
            StaticPaths.Select(path => new XElement(ns + "url", new XElement(ns + "loc", baseUrl + path))),
            entries.Select(e => new XElement(ns + "url",
                new XElement(ns + "loc", baseUrl + e.Path),
                new XElement(ns + "lastmod", e.LastModifiedUtc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)))));

        // Kufiri i protokollit: 50.000 URL për skedar. Larg nga shkalla e sotme; kur t'i afrohet,
        // kalohet te një sitemap index — e thënë hapur që të mos harrohet.
        if (entries.Count + StaticPaths.Length > 50_000)
        {
            return StatusCode(StatusCodes.Status500InternalServerError);
        }

        Response.Headers.CacheControl = "public, max-age=3600";
        var xml = new XDocument(new XDeclaration("1.0", "utf-8", null), urlset).ToString(SaveOptions.DisableFormatting);
        return Content($"<?xml version=\"1.0\" encoding=\"utf-8\"?>{xml}", "application/xml", Encoding.UTF8);
    }
}
