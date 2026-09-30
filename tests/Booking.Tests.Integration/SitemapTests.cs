using System.Net;
using System.Xml.Linq;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

[Collection("api")]
public class SitemapTests
{
    private const string BaseUrl = "https://www.example.test";

    private readonly BookingApiFactory _factory;

    public SitemapTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Sitemap_IsPublicXml_WithFrontendUrls()
    {
        var response = await _factory.CreateClient().GetAsync("/sitemap.xml");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/xml");
        response.Headers.CacheControl!.Public.Should().BeTrue();

        var locs = await LocsAsync(response);
        locs.Should().Contain($"{BaseUrl}/");
        locs.Should().Contain($"{BaseUrl}/kerko");
        locs.Should().Contain($"{BaseUrl}/klinika/{DbSeeder.Ids.ClinicDardania}");
        locs.Should().Contain($"{BaseUrl}/mjeku/{DbSeeder.Ids.DoctorDriton}");
        locs.Should().OnlyContain(l => l.StartsWith(BaseUrl), "URL-të janë të frontend-it, jo të API-t");
    }

    [Fact]
    public async Task Sitemap_ListsExactlyThePublicProfiles_NoDuplicates()
    {
        var locs = await LocsAsync(await _factory.CreateClient().GetAsync("/sitemap.xml"));

        locs.Should().OnlyHaveUniqueItems();

        // Çdo profil në sitemap duhet të hapet vërtet (asnjë URL që kthen 404).
        var client = _factory.CreateClient();
        foreach (var loc in locs.Where(l => l.Contains("/klinika/") || l.Contains("/mjeku/")))
        {
            var path = loc.Replace(BaseUrl, "").Replace("/klinika/", "/api/clinics/").Replace("/mjeku/", "/api/doctors/");
            (await client.GetAsync(path)).StatusCode.Should().Be(HttpStatusCode.OK, path);
        }
    }

    private static async Task<List<string>> LocsAsync(HttpResponseMessage response)
    {
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var doc = XDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.Descendants(ns + "loc").Select(e => e.Value).ToList();
    }
}
