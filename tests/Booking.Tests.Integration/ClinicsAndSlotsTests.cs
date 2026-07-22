using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Availability;
using Booking.Application.Features.Clinics;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

[Collection("api")]
public class ClinicsAndSlotsTests
{
    private readonly BookingApiFactory _factory;

    public ClinicsAndSlotsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SearchClinics_ReturnsSeededClinics()
    {
        var client = _factory.CreateClient();

        var result = await client.GetFromJsonAsync<PagedResult<ClinicDto>>("/api/clinics", TestHelpers.Json);

        result!.TotalItems.Should().BeGreaterThanOrEqualTo(2);
        result.Items.Should().Contain(c => c.Name == "Klinika Dentare Dardania");
    }

    [Fact]
    public async Task SearchClinics_BySearchTerm_FiltersResults()
    {
        var client = _factory.CreateClient();

        var result = await client.GetFromJsonAsync<PagedResult<ClinicDto>>(
            "/api/clinics?searchTerm=dentare", TestHelpers.Json);

        result!.Items.Should().OnlyContain(c => c.Name.Contains("Dentare", StringComparison.OrdinalIgnoreCase));
        result.TotalItems.Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task GetClinicById_Unknown_Returns404()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"/api/clinics/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetClinicDetails_IncludesBranchesAndServices()
    {
        var client = _factory.CreateClient();

        var clinic = await client.GetFromJsonAsync<ClinicDetailsDto>(
            $"/api/clinics/{DbSeeder.Ids.ClinicDardania}", TestHelpers.Json);

        clinic!.Branches.Should().HaveCount(2);
        clinic.Services.Should().HaveCount(3);
    }

    [Fact]
    public async Task AvailableSlots_SeededDoctor_ReturnsFullDayGrid()
    {
        // Dr. Driton (Ulpiana) rezervohet vetëm nga ky test — numri i sloteve është deterministik:
        // 08:00–12:00 dhe 13:00–17:00 me grid 30 min dhe shërbim 30-minutësh = 16 slote.
        var client = _factory.CreateClient();
        var date = TestHelpers.NextMonday();

        var slots = await client.GetFromJsonAsync<List<AvailableSlotDto>>(
            $"/api/doctors/{DbSeeder.Ids.DoctorDriton}/available-slots" +
            $"?branchId={DbSeeder.Ids.BranchUlpiana}&serviceId={DbSeeder.Ids.ServiceDentalCheckup}&date={date:yyyy-MM-dd}",
            TestHelpers.Json);

        slots!.Should().HaveCount(16);
        slots![0].StartDateTime.TimeOfDay.Should().Be(TimeSpan.FromHours(8));
        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public async Task AvailableSlots_ServiceNotOfferedByDoctor_Returns422()
    {
        // Dr. Driton nuk ofron pastrim dhëmbësh (vetëm mbushje + kontroll).
        var client = _factory.CreateClient();
        var date = TestHelpers.NextMonday();

        var response = await client.GetAsync(
            $"/api/doctors/{DbSeeder.Ids.DoctorDriton}/available-slots" +
            $"?branchId={DbSeeder.Ids.BranchUlpiana}&serviceId={DbSeeder.Ids.ServiceDentalCleaning}&date={date:yyyy-MM-dd}");

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }
}
