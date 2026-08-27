using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Booking.Infrastructure.Notifications;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Booking.Tests.Unit.Notifications;

public class ResendEmailServiceTests
{
    private const string ApiKey = "re_test_key";
    private const string FromAddress = "Rezervo Mjekun <no-reply@rezervomjekun.com>";

    [Fact]
    public void DIContainer_ResolvesResendEmailService_DespiteTwoPublicConstructors()
    {
        // ResendEmailService has a second public constructor (extra retryDelays param, for
        // tests) beyond the one AddHttpClient<T> expects. The built-in container is supposed
        // to skip constructors it can't fully satisfy and fall back to a resolvable one — but
        // that's exactly the kind of assumption worth proving rather than trusting, since a
        // wrong guess here would only surface at runtime in Production, never in a build.
        var services = new ServiceCollection();
        services.AddLogging();
        services.Configure<ResendSettings>(o =>
        {
            o.ApiKey = ApiKey;
            o.FromAddress = FromAddress;
        });
        services.AddHttpClient<ResendEmailService>(client => client.BaseAddress = new Uri("https://api.resend.com/"));

        using var provider = services.BuildServiceProvider();

        var act = () => provider.GetRequiredService<ResendEmailService>();

        act.Should().NotThrow();
    }

    [Fact]
    public async Task SendAsync_PostsCorrectPayloadAndAuthHeader_OnSuccess()
    {
        HttpRequestMessage? captured = null;
        JsonElement payload = default;

        var handler = new FakeHandler(async request =>
        {
            captured = request;
            payload = JsonSerializer.Deserialize<JsonElement>(await request.Content!.ReadAsStringAsync());
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { id = "email-id-123" })
            };
        });

        var sut = CreateSut(handler);

        await sut.SendAsync("pacienti@test.dev", "Rivendos fjalëkalimin", "<p>Trupi HTML</p>", "Trupi i email-it", CancellationToken.None);

        captured.Should().NotBeNull();
        captured!.Method.Should().Be(HttpMethod.Post);
        captured.RequestUri.Should().Be(new Uri("https://api.resend.com/emails"));
        captured.Headers.Authorization!.Scheme.Should().Be("Bearer");
        captured.Headers.Authorization.Parameter.Should().Be(ApiKey);
        captured.Headers.Should().Contain(h => h.Key == "Idempotency-Key");

        payload.GetProperty("from").GetString().Should().Be(FromAddress);
        payload.GetProperty("to")[0].GetString().Should().Be("pacienti@test.dev");
        payload.GetProperty("subject").GetString().Should().Be("Rivendos fjalëkalimin");
        payload.GetProperty("html").GetString().Should().Be("<p>Trupi HTML</p>", "Resend duhet të marrë GJITHMONË edhe html");
        payload.GetProperty("text").GetString().Should().Be("Trupi i email-it", "dhe GJITHMONË edhe text — jo vetëm njërin nga të dyja");

        handler.CallCount.Should().Be(1, "s'ka dështim, s'duhet riprovë");
    }

    [Fact]
    public async Task SendAsync_RetriesOnServerError_ThenSucceeds()
    {
        var attempt = 0;
        var handler = new FakeHandler(_ =>
        {
            attempt++;
            if (attempt < 3)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                {
                    Content = new StringContent("""{"message":"temporarily down"}""")
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { id = "email-id-123" })
            });
        });

        var sut = CreateSut(handler, fastRetries: true);

        await sut.SendAsync("pacienti@test.dev", "Subjekti", "<p>Trupi</p>", "Trupi", CancellationToken.None);

        handler.CallCount.Should().Be(3, "dy dështime transiente + një sukses");
    }

    [Fact]
    public async Task SendAsync_RetriesOnRateLimit_UsingSameIdempotencyKey()
    {
        var idempotencyKeys = new List<string>();
        var attempt = 0;
        var handler = new FakeHandler(request =>
        {
            idempotencyKeys.Add(request.Headers.GetValues("Idempotency-Key").Single());
            attempt++;
            var status = attempt < 2 ? HttpStatusCode.TooManyRequests : HttpStatusCode.OK;
            return Task.FromResult(new HttpResponseMessage(status)
            {
                Content = status == HttpStatusCode.OK
                    ? JsonContent.Create(new { id = "email-id-123" })
                    : new StringContent("""{"message":"rate limited"}""")
            });
        });

        var sut = CreateSut(handler, fastRetries: true);

        await sut.SendAsync("pacienti@test.dev", "Subjekti", "<p>Trupi</p>", "Trupi", CancellationToken.None);

        idempotencyKeys.Should().HaveCount(2);
        idempotencyKeys.Distinct().Should().ContainSingle(
            "riprovat e së njëjtës thirrje duhet të mbajnë të njëjtin Idempotency-Key, " +
            "ndryshe një dërgim i suksesshëm i padukshëm (timeout në përgjigje) rrezikon dublikim");
    }

    [Fact]
    public async Task SendAsync_DoesNotRetry_OnValidationError()
    {
        var handler = new FakeHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.UnprocessableEntity)
        {
            Content = new StringContent("""{"name":"invalid_parameter","message":"Invalid `to` field"}""")
        }));

        var sut = CreateSut(handler, fastRetries: true);

        var act = () => sut.SendAsync("adresë-e-keqe", "Subjekti", "<p>Trupi</p>", "Trupi", CancellationToken.None);

        await act.Should().ThrowAsync<EmailSendException>();
        handler.CallCount.Should().Be(1, "422 s'është transient — s'duhet riprovë");
    }

    [Fact]
    public async Task SendAsync_ThrowsAfterExhaustingRetries_OnPersistentServerError()
    {
        var handler = new FakeHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("""{"name":"application_error","message":"boom"}""")
        }));

        var sut = CreateSut(handler, fastRetries: true);

        var act = () => sut.SendAsync("pacienti@test.dev", "Subjekti", "<p>Trupi</p>", "Trupi", CancellationToken.None);

        (await act.Should().ThrowAsync<EmailSendException>()).Which.Message.Should().Contain("500");
        handler.CallCount.Should().Be(3, "3 tentativa gjithsej pastaj dorëzohet");
    }

    [Fact]
    public async Task SendAsync_RetriesOnNetworkFailure_ThenSucceeds()
    {
        var attempt = 0;
        var handler = new FakeHandler(_ =>
        {
            attempt++;
            if (attempt < 2)
            {
                throw new HttpRequestException("connection reset");
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { id = "email-id-123" })
            });
        });

        var sut = CreateSut(handler, fastRetries: true);

        await sut.SendAsync("pacienti@test.dev", "Subjekti", "<p>Trupi</p>", "Trupi", CancellationToken.None);

        handler.CallCount.Should().Be(2);
    }

    private static readonly TimeSpan[] InstantRetryDelays = [TimeSpan.Zero, TimeSpan.Zero];

    private static ResendEmailService CreateSut(FakeHandler handler, bool fastRetries = false)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.resend.com/") };
        var settings = Options.Create(new ResendSettings { ApiKey = ApiKey, FromAddress = FromAddress });

        return fastRetries
            ? new ResendEmailService(httpClient, settings, NullLogger<ResendEmailService>.Instance, InstantRetryDelays)
            : new ResendEmailService(httpClient, settings, NullLogger<ResendEmailService>.Instance);
    }

    /// <summary>HttpMessageHandler i rremë: nuk bën thirrje të vërteta HTTP.</summary>
    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _respond;
        public int CallCount { get; private set; }

        public FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
            : this(request => Task.FromResult(respond(request)))
        {
        }

        public FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond)
        {
            _respond = respond;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            return await _respond(request);
        }
    }
}
