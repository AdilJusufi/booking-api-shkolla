using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Patients;
using Booking.Domain.Enums;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>Pjesa 3c (WR-10): pacienti rezervon për anëtarin e familjes së vet — vetëm të vetin.</summary>
[Collection("api")]
public class DependentBookingTests
{
    private readonly BookingApiFactory _factory;

    public DependentBookingTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Patient_CanBookForOwnFamilyMember_AndTheEmailNamesThem()
    {
        var email = $"prind-{Guid.NewGuid():N}@test.dev";
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client, email)).AccessToken);
        var child = await AddChildAsync(client, "Lira");

        var response = await BookAsync(client, child.Id, new TimeOnly(14, 0));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var appointment = await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        appointment!.DependentId.Should().Be(child.Id);
        appointment.DependentName.Should().Be("Lira Testi");

        var inbox = await client.GetFromJsonAsync<List<DevEmail>>($"/api/dev/emails?toEmail={Uri.EscapeDataString(email)}", TestHelpers.Json);
        inbox!.Should().Contain(m => m.Subject == "Termini u konfirmua" && m.TextBody.Contains("për Lira Testi"));
    }

    [Fact]
    public async Task Patient_CannotBookForSomeoneElsesFamilyMember()
    {
        var other = _factory.CreateClient();
        other.WithToken((await TestHelpers.RegisterPatientAsync(other)).AccessToken);
        var othersChild = await AddChildAsync(other, "Huaj");

        var me = await _factory.CreateSignedInClientAsync();
        var response = await BookAsync(me, othersChild.Id, new TimeOnly(14, 30));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private static async Task<DependentDto> AddChildAsync(HttpClient client, string firstName)
    {
        var response = await client.PostAsJsonAsync("/api/patients/me/dependents", new CreateDependentRequest
        {
            FirstName = firstName,
            LastName = "Testi",
            DateOfBirth = new DateOnly(2018, 5, 1),
            Gender = Gender.Female,
            Relationship = DependentRelationship.Child
        }, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<DependentDto>(TestHelpers.Json))!;
    }

    private static Task<HttpResponseMessage> BookAsync(HttpClient client, Guid dependentId, TimeOnly time) =>
        client.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = DbSeeder.Ids.DoctorBlerta,
            ClinicBranchId = DbSeeder.Ids.BranchUlpiana,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            DependentId = dependentId,
            StartDateTime = TestHelpers.NextMonday().AddDays(10).ToDateTime(time)
        }, TestHelpers.Json);
}
