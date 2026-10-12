using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Appointments;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// NoShow / Completed para fillimit të terminit refuzohen me një kod specifik (422), jo me
/// një gabim gjenerik — frontend-i e përkthen kodin në mesazh të qartë.
/// </summary>
[Collection("api")]
public class DoctorAppointmentActionsTests
{
    private readonly BookingApiFactory _factory;

    public DoctorAppointmentActionsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("no-show", "no-show-before-start")]
    [InlineData("complete", "complete-before-start")]
    public async Task FutureAppointment_StatusActionBeforeStart_Returns422WithCode(string action, string expectedCode)
    {
        // Dr. Arben @ Dardania, e martë 11:00/11:30 — orë që s'i përdorin testet e tjera.
        var appointmentId = await BookFutureAppointmentAsync(action == "no-show" ? new TimeOnly(11, 0) : new TimeOnly(11, 30));

        var doctor = _factory.CreateClient();
        doctor.WithToken((await TestHelpers.LoginAsync(
            doctor, DbSeeder.DoctorEmails[0], BookingApiFactory.DefaultUserPassword)).AccessToken);

        var response = await doctor.PostAsync($"/api/doctor/appointments/{appointmentId}/{action}", null);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        var problem = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>(TestHelpers.Json);
        problem!["code"].ToString().Should().Be(expectedCode);
    }

    private async Task<Guid> BookFutureAppointmentAsync(TimeOnly time)
    {
        var patient = _factory.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);

        var response = await patient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = DbSeeder.Ids.DoctorArben,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = TestHelpers.NextMonday().AddDays(1).ToDateTime(time)
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!.Id;
    }
}
