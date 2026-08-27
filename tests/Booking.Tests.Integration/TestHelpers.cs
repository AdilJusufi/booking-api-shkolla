using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Auth;
using Booking.Domain.Enums;

namespace Booking.Tests.Integration;

/// <summary>
/// Simulon Resend real-isht poshtë (ose çfarëdo IEmailService tjetër) duke dështuar
/// gjithmonë — regjistrohet nëpërmjet WithWebHostBuilder për të provuar se rrugët që
/// duhet të mos bllokohen nga një email i dështuar (regjistrim pacienti, forgot-password)
/// vërtet nuk bllokohen.
/// </summary>
public sealed class AlwaysThrowingEmailService : IEmailService
{
    public Task SendAsync(string toEmail, string subject, string htmlBody, string textBody, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("Dështim i simuluar i dërgimit të email-it (testi).");
}

/// <summary>
/// IDateTimeProvider i kontrollueshëm — testet e cooldown/tavan-ditor duan të kalojnë
/// minuta/ditë "kohe" pa pritur realisht. Regjistrohet si Singleton nëpërmjet
/// WithWebHostBuilder; testi e mban referencën dhe ia ndryshon UtcNow mes kërkesave.
///
/// Data fillestare RASTËSORE (jo "sot", jo një konstante fikse): EmailSendAttempts
/// jeton në TË NJËJTËN bazë të dhënash për gjithë collection fixture-in, kështu që një
/// ditë fikse do të përplasej me rreshtat e testeve të tjera që përdorin gjithashtu
/// ManualClock (të gjithë do të "binin" në të njëjtën ditë UTC).
/// </summary>
public sealed class ManualClock : IDateTimeProvider
{
    public DateTime UtcNow { get; set; } =
        new DateTime(2000, 1, 1, 8, 0, 0, DateTimeKind.Utc).AddDays(Random.Shared.Next(0, 9000));
}

public static class TestHelpers
{
    // No JsonStringEnumConverter: the API doesn't register one either (see
    // Program.cs — enums serialize as numbers, and the frontend expects
    // that), so request bodies built with this options object need to send
    // enums as numbers too, or model binding 400s.
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Data e hënës së ardhshme, së paku 7 ditë larg — brenda orarit të seed-uar (Hën–Pre) dhe jashtë cutoff-it të anulimit.</summary>
    public static DateOnly NextMonday()
    {
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(7);
        while (date.DayOfWeek != DayOfWeek.Monday)
        {
            date = date.AddDays(1);
        }

        return date;
    }

    public static async Task<AuthResponse> RegisterPatientAsync(HttpClient client, string? email = null)
    {
        email ??= $"pacient-{Guid.NewGuid():N}@test.dev";
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            FirstName: "Testi",
            LastName: "Integrimi",
            Email: email,
            PhoneNumber: "+383 44 000 000",
            Password: BookingApiFactory.DefaultUserPassword,
            DateOfBirth: new DateOnly(1992, 2, 2),
            Gender: Gender.Female,
            Address: null,
            City: "Prishtinë"), Json);

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    public static async Task<AuthResponse> LoginAsync(HttpClient client, string email, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password), Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    public static HttpClient WithToken(this HttpClient client, string accessToken)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }
}
