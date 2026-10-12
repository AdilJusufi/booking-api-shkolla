using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Doctors;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Kush hyn te çfarë pa login. Profilet (klinikë/doktor) dhe listat e plota janë publike, read-only, që
/// Google dhe vizitorët t'i shohin; disponueshmëria (slotet/ditët) dhe rezervimi kërkojnë login.
/// Tabela është kontrata: një veprim i ri pa atribut mbetet PRIVAT (default-deny në kontrollerë).
/// </summary>
[Collection("api")]
public class PublicAccessTests
{
    private const string Clinic = "11111111-1111-1111-1111-111111111111";
    private const string Doctor = "55555555-0003-5555-5555-555555555555";
    private const string Branch = "11111111-bbbb-1111-1111-111111111111";
    private const string Service = "44444444-0003-4444-4444-444444444444";

    private readonly BookingApiFactory _factory;

    public PublicAccessTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("/api/clinics")]
    [InlineData($"/api/clinics/{Clinic}")]
    [InlineData($"/api/clinics/{Clinic}/branches")]
    [InlineData($"/api/clinics/{Clinic}/doctors")]
    [InlineData($"/api/clinics/{Clinic}/services")]
    [InlineData("/api/doctors")]
    [InlineData($"/api/doctors/{Doctor}")]
    [InlineData($"/api/doctors/{Doctor}/services")]
    public async Task ProfileEndpoints_AreOpenWithoutLogin(string url)
    {
        var response = await _factory.CreateClient().GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData($"/api/doctors/{Doctor}/available-slots?branchId={Branch}&serviceId={Service}&date=2030-01-07")]
    [InlineData($"/api/doctors/{Doctor}/available-days?branchId={Branch}&serviceId={Service}&from=2030-01-07&to=2030-01-13")]
    public async Task AvailabilityEndpoints_RequireLogin(string url)
    {
        var response = await _factory.CreateClient().GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Booking_RequiresLogin()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/appointments", new { }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task SignedIn_CanReadAvailability()
    {
        var client = await _factory.CreateSignedInClientAsync();

        var response = await client.GetAsync(
            $"/api/doctors/{Doctor}/available-slots?branchId={Branch}&serviceId={Service}&date={TestHelpers.NextMonday():yyyy-MM-dd}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Lists_AreNotCappedForVisitors()
    {
        var clients = _factory.CreateClient();

        var doctors = await clients.GetFromJsonAsync<PagedResult<DoctorDto>>("/api/doctors?PageSize=100", TestHelpers.Json);
        var clinicPage = await clients.GetFromJsonAsync<PagedResult<ClinicDto>>("/api/clinics?PageSize=100", TestHelpers.Json);

        doctors!.PageSize.Should().Be(100);
        doctors.Items.Count.Should().Be(doctors.TotalItems);
        clinicPage!.PageSize.Should().Be(100);
    }

    [Fact]
    public async Task ClinicAndDoctorDetails_ExposeNoPrivateData()
    {
        // Profilet publike s'duhet të rrjedhin email/telefon personal të doktorit apo ID përdoruesish.
        var client = _factory.CreateClient();

        var doctorJson = await client.GetStringAsync($"/api/doctors/{Doctor}");

        doctorJson.Should().NotContainEquivalentOf("@booking.dev");
        doctorJson.Should().NotContainEquivalentOf("phoneNumber");
        doctorJson.Should().NotContainEquivalentOf("userId");
    }
}
